<!-- AI: This file was substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/. -->

# Sprint 3 Load Test Results — routing, incident, and dispatch services

## Setup

The test ran from the Gantry devcontainer attached directly to an isolated
Compose network. Each iteration exercised three service paths:

1. `GET /route` through `regional-routing-ambassador`, Caddy, and the three
   `regional-routing-service` replicas.
2. `POST /incidents` through `incident-ambassador` to Austin's owned
   `incident-service`.
3. `POST /dispatches` directly to Bruce's owned
   `responder-dispatch-service`, which has no ambassador.

```bash
docker compose up --build -d
docker network connect <compose-network> <gantry-container>
BASE_URL=http://regional-routing-ambassador:3000 \
INCIDENT_BASE_URL=http://incident-ambassador:3000 \
DISPATCH_BASE_URL=http://responder-dispatch-service:3000 \
k6 run --summary-export=results/k6-summary.json \
  load-tests/sprint-3-load.js
```

The script used 10 virtual users for 30 seconds with a one-second sleep after
each routing/incident/dispatch iteration. It completed 160 iterations and 480
HTTP requests. Routing and incident inputs used synthetic fixture-compatible
coordinates and emergency types. Each dispatch used a unique synthetic UUID
and a real fixture-backed response-team ID.

## Measured results

The per-service values come from custom k6 counters, Rates, and Trends so the
three different SLOs are not obscured by the combined HTTP distribution.

| Metric | `regional-routing-service` (`GET /route`) | `incident-service` (`POST /incidents`) | `responder-dispatch-service` (`POST /dispatches`) |
|---|---:|---:|---:|
| Requests | 160 | 160 | 160 |
| Request rate | 5.12 req/s | 5.12 req/s | 5.12 req/s |
| Error rate | 0.00% | 0.00% | 0.00% |
| p50 latency | 163.56 ms | 299.94 ms | 210.40 ms |
| p95 latency | 792.05 ms | 997.30 ms | 486.17 ms |
| p99 latency | 1,085.09 ms | 2,527.10 ms | 1,364.86 ms |

Combined results were 480 requests at 15.36 req/s with a 0.00% HTTP error
rate. All 1,440 response checks passed. In particular, all 160 dispatch writes
returned `201`, a non-empty `dispatchId`, the initial `assigned` status, and
the requested response-team ID.

## Comparison against `docs/SLO.md`

### `regional-routing-service`

- **Latency SLO not met:** p95 was 792.05 ms against the 400 ms target.
- **Reliability SLO met:** all 160 routing requests returned valid responses,
  exceeding the 99% target.

The 163.56 ms median remained below the target because repeated lookups could
use Redis, but the 792.05 ms p95 and 1,085.09 ms p99 show that cache misses and
shared-container contention dominated the tail during the three-service run.
This is a latency-capacity problem rather than a correctness failure because
every routed response remained valid.

### `incident-service`

- **Latency SLO not met:** p95 was 997.30 ms against the 250 ms target.
- **Reliability SLO met:** all 160 incident writes returned valid `201`
  responses, exceeding the 99% target.

The 254.22 ms minimum already exceeded the latency target because the path
combines the service's configured 200 ms processing delay with the
ambassador's 50 ms inspection delay before network overhead. The 997.30 ms p95
shows that concurrent container contention added a substantial tail beyond
that fixed latency floor, while the zero-error result confirms the writes
remained functionally correct.

<!-- AI: Bruce's individual Sprint 3 analysis compares the measured dispatch path with his owned service's SLOs. -->
### `responder-dispatch-service`

- **Latency SLO met:** p95 was 486.17 ms against the 500 ms target. This passed
  with only 13.83 ms of margin, while p99 reached 1,364.86 ms, so the result
  exposes meaningful tail-latency risk despite meeting the stated percentile.
- **Reliability SLO met:** all 160 dispatch writes returned valid `201`
  responses and all 480 dispatch-specific checks passed, exceeding the 99%
  target.
- **Exactly-once invariant not measured:** the script deliberately sends a
  unique incident ID for each write. A dedicated duplicate-request test would
  be needed to determine whether concurrent retries can create two dispatches
  for the same incident.

The k6 process completed every iteration, but it reported failed routing and
incident latency thresholds. Those failures remain in `results/k6-run.log`;
Bruce's dispatch latency and reliability thresholds both passed.

## Interpretation

<!-- AI: This interpretation explains Bruce's service behavior and the combined-run bottleneck without hiding threshold failures. -->
The updated run proves that Bruce's `responder-dispatch-service` functions
correctly within the full system under concurrent load. Every synthetic
dispatch was accepted and returned a correctly shaped assignment for the
requested team.

Dispatch latency has a fixed floor from the configured 200 ms
`DISPATCH_LATENCY_MS`. The 210.40 ms median shows that normal proxy/network
overhead is small, but the 486.17 ms p95 nearly consumes the 500 ms budget and
the 1,364.86 ms p99 shows a much longer contention tail. Unlike routing reads,
each dispatch is a new state-changing operation and cannot be made faster with
the existing route cache.

The three-service run also increased system-wide contention compared with the
earlier two-service baseline: routing and incident reliability stayed at
100%, but both latency p95 values crossed their thresholds. The next useful
tests are a higher-load dispatch stress test to locate its saturation point
and a duplicate-incident test to evaluate the exactly-once requirement. If
dispatch tail latency grows under that pressure, a later sprint could evaluate
queueing or safe shared-state replication rather than caching write results.

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/. -->
