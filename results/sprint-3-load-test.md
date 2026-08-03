<!-- AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md. -->
# Sprint 3 Load Test: regional-routing-service (via Caddy + Redis)

## How it was run

`load-tests/sprint-3-load.js` was run with k6 (Docker image `grafana/k6`, attached
to the compose network) against `regional-routing-ambassador`, which forwards to
`regional-routing-load-balancer` (Caddy), which round-robins across the three
`regional-routing-service` replicas:

```
docker compose up --build -d
docker run --rm --network 426-project-bay-blues_default \
  -v "$(pwd)/load-tests:/scripts" \
  -e BASE_URL=http://regional-routing-ambassador:3000 \
  grafana/k6 run /scripts/sprint-3-load.js
```

15 virtual users for 30 seconds. The script models a Mullins Center-style event:
~80% of requests reuse one of four hot-spot coordinates (cache hits after the
first lookup), and ~20% hit dispersed, slightly jittered campus coordinates
(mostly cache misses). Server logs across the run showed roughly a 90%+ Redis
cache hit rate for `/route` lookups.

## Results

| Metric | Value |
|---|---|
| p50 latency | 5.7 ms |
| p95 latency | 21.9 ms |
| p99 latency | 222.5 ms |
| Request rate | 14.8 req/s (450 requests / 30s, 15 VUs each pacing ~1 req/s) |
| Error rate | 0.00% (450/450 checks passed, `http_req_failed` rate = 0%) |

The large gap between p95 and p99 is the cache boundary: cache hits resolve in
single-digit milliseconds (a Redis round trip plus JSON parsing), while a cache
miss pays the full simulated `ROUTING_LATENCY_MS` (200 ms) compute delay before
the result is stored back in Redis. With roughly a 1-in-10 miss rate, the p95
sits comfortably in hit territory and the p99 captures the miss cost.

## Comparison against docs/SLO.md

`regional-routing-service`'s SLO requires `GET /route` to respond within
**400 ms at the p95** and succeed **at least 99%** of the time, even during a
demand spike.

- **Latency SLO: met.** p95 (21.9 ms) and even p99 (222.5 ms) are both well
  under the 400 ms target. The SLO was written assuming a Mullins-Center-style
  spike where many requests target the same few venues, which is exactly the
  access pattern the Redis cache absorbs.
- **Reliability SLO: met.** 0% error rate across 450 requests, comfortably
  above the 99% success target, and Caddy's round-robin plus health checks kept
  all three replicas usable throughout.

We are not currently exercising the "one replica down" case in this load test,
so this run does not by itself validate the SLO under a replica failure; that
was verified separately in `docs/SERVICES.md`'s manual verification steps.

## Interpretation

At 15 VUs / ~15 req/s, none of Caddy, the three routing replicas, or Redis are
under real pressure — this run establishes a healthy baseline, not a stress
test. The practical bottleneck visible in the data is the simulated
`ROUTING_LATENCY_MS` compute cost on a cache miss (200 ms), not the network
hops through the ambassador or Caddy: hits return in ~3-6 ms, so the
proxy/load-balancer overhead is negligible next to the miss cost.

The cache is doing exactly the job it's meant to: it converts what would
otherwise be a uniformly ~200 ms endpoint into one where 9 out of 10 requests
finish in single-digit milliseconds. The main risk this baseline doesn't
surface is cold-cache behavior — if the venue mix shifts (a new hot spot, or
the 30-second TTL expiring during a lull), a larger share of requests would
fall back to the 200 ms miss path, and p95 would climb toward it. For Sprint 5,
we'd want a higher-VU run (to see whether Redis or a single replica becomes a
contention point under real concurrency) and a run with a colder cache (TTL
near 0, or all-unique coordinates) to measure the worst-case miss-dominated
latency profile, since that's the scenario the 400 ms SLO is actually meant to
guard against.
<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md. -->
