<!-- AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md. -->
# Sprint 3 Load Test: regional-routing-service (via Caddy + Redis) and responder-dispatch-service

## How it was run

`load-tests/sprint-3-load.js` was run with k6 (Docker image `grafana/k6`, attached
to the compose network). Each iteration sends two requests:

1. `GET /route` against `regional-routing-ambassador`, which forwards to
   `regional-routing-load-balancer` (Caddy), which round-robins across the
   three `regional-routing-service` replicas.
2. `POST /dispatches` directly against `responder-dispatch-service` (it has no
   ambassador in front of it), assigning a random UUID `incidentId` to a
   randomly chosen real `teamId` from its team roster.

```
docker compose up --build -d
docker run --rm --network 426-project-bay-blues_default \
  -v "$(pwd)/load-tests:/scripts" \
  -e BASE_URL=http://regional-routing-ambassador:3000 \
  -e DISPATCH_BASE_URL=http://responder-dispatch-service:3000 \
  grafana/k6 run /scripts/sprint-3-load.js
```

15 virtual users for 30 seconds (375 iterations, 750 total requests). The
routing request models a Mullins Center-style event: ~80% of requests reuse
one of four hot-spot coordinates (cache hits after the first lookup), and
~20% hit dispersed, slightly jittered campus coordinates (mostly cache
misses). The dispatch request has no caching and always pays the service's
simulated `DISPATCH_LATENCY_MS` (200 ms) compute delay.

## Results

Latency is reported separately per endpoint via k6 custom Trend metrics
(`routing_route_duration`, `dispatch_create_duration`), since the two
services have different SLOs and the blended `http_req_duration` would
obscure both.

| Metric | `regional-routing-service` (`GET /route`) | `responder-dispatch-service` (`POST /dispatches`) |
|---|---|---|
| p50 latency | 6.0 ms | 201.5 ms |
| p95 latency | 26.7 ms | 203.0 ms |
| p99 latency | 220.5 ms | 203.5 ms |
| Request rate | 12.3 req/s (375 requests / 30s) | 12.3 req/s (375 requests / 30s) |
| Error rate | 0.00% (375/375 `routing status is 200` checks passed) | 0.00% (375/375 `dispatch status is 201` checks passed) |

Combined: 750 requests in ~30.5s, 24.6 req/s overall, 0% `http_req_failed`
across both endpoints.

For `regional-routing-service`, the gap between p50/p95 and p99 is the cache
boundary: cache hits resolve in single-digit milliseconds (a Redis round trip
plus JSON parsing), while a cache miss pays the full simulated
`ROUTING_LATENCY_MS` (200 ms) compute delay before the result is stored back
in Redis. `responder-dispatch-service` has no cache, so every request pays
close to the full simulated `DISPATCH_LATENCY_MS` (200 ms) with very little
spread — p50, p95, and p99 all sit within a few milliseconds of each other.

## Comparison against docs/SLO.md

**`regional-routing-service`** requires `GET /route` to respond within
**400 ms at the p95** and succeed **at least 99%** of the time, even during a
demand spike.

- **Latency SLO: met.** p95 (26.7 ms) and even p99 (220.5 ms) are both well
  under the 400 ms target. The SLO was written assuming a Mullins-Center-style
  spike where many requests target the same few venues, which is exactly the
  access pattern the Redis cache absorbs.
- **Reliability SLO: met.** 0% error rate across 375 requests, comfortably
  above the 99% success target, and Caddy's round-robin plus health checks
  kept all three replicas usable throughout.

**`responder-dispatch-service`** requires `POST /dispatches` to respond
within **500 ms at the p95**, succeed **at least 99%** of the time, and never
double-dispatch a single incident (at-most-once assignment).

- **Latency SLO: met, with less margin than routing.** p95 (203.0 ms) and p99
  (203.5 ms) are both comfortably under the 500 ms target, but the margin is
  much smaller than `regional-routing-service`'s: this endpoint has no cache,
  so essentially every request pays the full simulated compute delay, and the
  entire distribution sits close to that 200 ms floor rather than mostly
  resolving in single-digit milliseconds.
- **Reliability SLO: met.** 0% error rate across 375 requests. The
  exactly-once dispatch invariant is not directly exercised by this load test
  — the script sends a unique `incidentId` per request rather than retrying
  the same one, so it does not test what happens if the same incident is
  dispatched twice concurrently. That would need a dedicated test in Sprint 5
  (e.g. firing duplicate `POST /dispatches` for the same `incidentId`/`teamId`
  pair and confirming only one dispatch is created).

We are not currently exercising the "one replica down" case for
`regional-routing-service` in this load test; that was verified separately in
`docs/SERVICES.md`'s manual verification steps. `responder-dispatch-service`
has no replicas in this sprint.

## Interpretation

At 15 VUs / ~12 req/s per endpoint, none of Caddy, the three routing
replicas, Redis, or `responder-dispatch-service` are under real pressure —
this run establishes a healthy baseline, not a stress test.

For `regional-routing-service`, the practical bottleneck visible in the data
is the simulated `ROUTING_LATENCY_MS` compute cost on a cache miss (200 ms),
not the network hops through the ambassador or Caddy: hits return in a few
milliseconds, so the proxy/load-balancer overhead is negligible next to the
miss cost. The cache is doing exactly the job it's meant to: it converts what
would otherwise be a uniformly ~200 ms endpoint into one where most requests
finish in single-digit milliseconds. The main risk this baseline doesn't
surface is cold-cache behavior — if the venue mix shifts (a new hot spot, or
the 30-second TTL expiring during a lull), a larger share of requests would
fall back to the 200 ms miss path, and p95 would climb toward it.

For `responder-dispatch-service`, the bottleneck is simply the fixed
simulated `DISPATCH_LATENCY_MS`, since there is no caching or other
short-circuit on this path — every dispatch is a genuinely new write, so
unlike routing lookups there's no obvious cache key to reuse (each dispatch
is for a distinct incident). Its 500 ms SLO has real margin today (p95 at
203 ms), but that margin would shrink if the simulated latency were ever
increased or if this endpoint were put under much higher concurrency, since
there's currently no mechanism (replication, queuing, etc.) absorbing load
spikes the way Redis does for routing.

For Sprint 5, we'd want a higher-VU run (to see whether Redis or a single
routing replica becomes a contention point under real concurrency, and
whether `responder-dispatch-service`'s single, unreplicated instance becomes
a bottleneck under load), a colder-cache run for routing (TTL near 0, or
all-unique coordinates) to measure the worst-case miss-dominated latency
profile, and a duplicate-dispatch test to validate the exactly-once
assignment invariant under concurrent requests.
<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md. -->
