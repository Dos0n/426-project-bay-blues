# Sprint 3 Load Test Results — regional-routing-service

## Setup

| Item | Value |
|------|--------|
| Script | `load-tests/sprint-3-load.js` |
| Target | `GET http://localhost:3002/route` (routing ambassador → Caddy → 3 routing replicas) |
| Load | 10 VUs, 30s duration, 1s sleep between iterations |
| Inputs | Rotating campus region centers + emergency types from `regional-routing-service/data/regions.json` |
| Tool | k6 v2.1.0 |
| Date | 2026-08-03 |

Default compose settings: `ROUTING_LATENCY_MS=200` on each replica; ambassador retries on upstream 5xx/timeout.

## Measured results

| Metric | Value |
|--------|--------|
| Total requests | 250 |
| Request rate | **8.25 req/s** |
| Error rate (`http_req_failed`) | **0.00%** (0 / 250) |
| Checks passed | 100% (750 / 750) — status 200, `regionId`, `responseGroup.id` |
| Latency p50 (median) | **210.44 ms** |
| Latency p95 | **217.84 ms** |
| Latency p99 | **220.57 ms** |
| Latency avg / min / max | 210.79 ms / 202.80 ms / 221.31 ms |

k6 thresholds configured in the script both passed:

- `http_req_duration` `p(95)<400` → p(95) = 217.84 ms ✓
- `http_req_failed` `rate<0.01` → rate = 0.00% ✓

## Comparison to `docs/SLO.md` (regional-routing-service)

| SLO | Target | Measured | Result |
|-----|--------|----------|--------|
| **Latency** | `GET /route` p95 ≤ **400 ms** | p95 = **217.84 ms** (p99 = 220.57 ms) | **Hit** |
| **Reliability** | Success ≥ **99%** (error rate &lt; 1%) | Error rate = **0.00%** | **Hit** |

Both regional-routing-service SLOs were met under this load profile.

## Interpretation

**What the numbers mean.** End-to-end latency sits in a tight band just above 200 ms (p50 ≈ 210 ms, p99 ≈ 221 ms). That matches the intentional simulated processing delay (`ROUTING_LATENCY_MS=200`) plus a small amount of ambassador + Caddy + network overhead (~10–20 ms). Responses stayed successful for every iteration: load balancing across three replicas did not introduce failures at 10 concurrent clients.

**Bottleneck.** At this intensity the bottleneck is **not** replica CPU or Caddy capacity — it is the **fixed artificial latency** in the routing service. Throughput is further capped by the script’s `sleep(1)`: each VU does roughly one request per ~1.21 s, so 10 VUs ≈ 8.3 req/s by design. We are exercising the load-balanced path correctly, but we are not near a saturation or failure cliff.

**What we would change later.**

1. Raise VUs and remove or reduce think-time to push higher RPS and see when p95 climbs or replicas queue.
2. Lower or parameterize `ROUTING_LATENCY_MS` if we want the test to measure infrastructure overhead instead of the simulated service delay (the SLO’s 400 ms budget is mostly spent on that delay today).
3. Add failure scenarios (stop one replica mid-run) to validate Caddy health checks and ambassador retries under partial outage, not only the happy path.
4. Optionally track `servedBy` distribution to confirm round-robin balance across `regional-routing-service-a/b/c`.
