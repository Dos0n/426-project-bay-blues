<!-- AI: This file was generated with AI assistance for Sprint 5. See AI-DISCLOSURE.md and ai/chats/. -->

# Sprint 5 Final Load Test Results — fully instrumented system

## Setup

This is the final load test, run against the system in its fully instrumented
state (Prometheus `/metrics` on every custom service, a provisioned Grafana
dashboard, and structured JSON logging). The workload is identical to the
Sprint 3 test so the two runs are directly comparable; the only intentional
changes are the duration (60s, up from 30s) and that the system now carries the
Sprint 4 async notification path and Sprint 5 observability instrumentation.

Each iteration exercises the same three paths as Sprint 3:

1. **Primary path** — `GET /route` through `regional-routing-ambassador`,
   Caddy, and the three `regional-routing-service` replicas (the path the
   committed Grafana dashboard, `grafana/dashboards/routing-main-path.json`,
   reports on).
2. `POST /incidents` through `incident-ambassador` to `incident-service`.
3. `POST /dispatches` directly to `responder-dispatch-service` (no ambassador).

The test ran with **10 virtual users for 60 seconds** with a one-second sleep
after each iteration, meeting the Sprint 5 requirement of ≥60s at ≥10 VUs. k6
ran in a container attached to the Compose network so it reaches the services
by their internal hostnames.

```bash
docker compose up --build -d          # 13 services, all healthy

docker run --rm --network 426-project-bay-blues_default \
  -e BASE_URL=http://regional-routing-ambassador:3000 \
  -e INCIDENT_BASE_URL=http://incident-ambassador:3000 \
  -e DISPATCH_BASE_URL=http://responder-dispatch-service:3000 \
  -v "$PWD/load-tests:/scripts:ro" -v "$PWD/results:/results" \
  grafana/k6 run --summary-export=/results/sprint-5-k6-summary.json \
  /scripts/sprint-5-load.js
```

The full run log is saved at `results/sprint-5-k6-run.log` and the machine
-readable summary at `results/sprint-5-k6-summary.json`.

## Full k6 summary output

```
  █ THRESHOLDS

    dispatch_create_duration
    ✓ 'p(95)<500' p(95)=208.45ms

    dispatch_create_failed
    ✓ 'rate<0.01' rate=0.00%

    http_req_failed
    ✓ 'rate<0.01' rate=0.00%

    incident_create_duration
    ✗ 'p(95)<250' p(95)=271.55ms

    incident_create_failed
    ✓ 'rate<0.01' rate=0.00%

    routing_route_duration
    ✓ 'p(95)<400' p(95)=210.82ms

    routing_route_failed
    ✓ 'rate<0.01' rate=0.00%


  █ TOTAL RESULTS

    checks_total.......: 3609    58.986438/s
    checks_succeeded...: 100.00% 3609 out of 3609
    checks_failed......: 0.00%   0 out of 3609

    ✓ status is 200
    ✓ route returns regionId
    ✓ route returns responseGroup
    ✓ incident status is 201
    ✓ incident returns incidentId
    ✓ incident starts reported
    ✓ dispatch status is 201
    ✓ dispatch returns dispatchId
    ✓ dispatch starts assigned to requested team

    CUSTOM
    dispatch_create_duration.......: avg=203.64ms min=199.64ms med=202.95ms max=217.37ms p(50)=202.95ms p(95)=208.45ms p(99)=210.89ms
    dispatch_create_failed.........: 0.00%  0 out of 401
    dispatch_create_requests.......: 401    6.554049/s
    incident_create_duration.......: avg=262.72ms min=253.14ms med=262.1ms  max=280.74ms p(50)=262.1ms  p(95)=271.55ms p(99)=276.31ms
    incident_create_failed.........: 0.00%  0 out of 401
    incident_create_requests.......: 401    6.554049/s
    routing_route_duration.........: avg=41ms     min=2.6ms    med=7.34ms   max=233.36ms p(50)=7.34ms   p(95)=210.82ms p(99)=215.34ms
    routing_route_failed...........: 0.00%  0 out of 401
    routing_route_requests.........: 401    6.554049/s

    HTTP
    http_req_duration..............: avg=169.12ms min=2.6ms    med=204.3ms  max=280.74ms p(50)=204.3ms  p(95)=267.58ms p(99)=273.25ms
      { expected_response:true }...: avg=169.12ms min=2.6ms    med=204.3ms  max=280.74ms p(50)=204.3ms  p(95)=267.58ms p(99)=273.25ms
    http_req_failed................: 0.00%  0 out of 1203
    http_reqs......................: 1203   19.662146/s

    EXECUTION
    iteration_duration.............: avg=1.51s    min=1.45s    med=1.47s    max=1.7s     p(50)=1.47s    p(95)=1.68s    p(99)=1.69s
    iterations.....................: 401    6.554049/s
    vus............................: 2      min=2         max=10
    vus_max........................: 10     min=10        max=10

    NETWORK
    data_received..................: 720 kB 12 kB/s
    data_sent......................: 297 kB 4.9 kB/s

running (1m01.2s), 00/10 VUs, 401 complete and 0 interrupted iterations
time="2026-08-11T21:32:53Z" level=error msg="thresholds on metrics 'incident_create_duration' have been crossed"
```

The run completed 401 iterations and 1,203 HTTP requests at 19.66 req/s with a
**0.00% HTTP error rate** and **all 3,609 response checks passing**. One
threshold was crossed: `incident_create_duration` p95 = 271.55 ms against the
250 ms target.

## Prometheus cross-check (the instrumented pipeline)

Because the whole point of this run is that the system is now observable, the
same traffic was verified through the local Prometheus (`localhost:9090`),
which scraped all 8 service targets throughout:

| Path | k6 p95 (raw samples) | Prometheus `histogram_quantile(0.95)` |
|---|---:|---:|
| `GET /route` | 210.82 ms | 205.6 ms |
| `POST /incidents` | 271.55 ms | **242.5 ms** |
| `POST /dispatches` | 208.45 ms | 242.5 ms |

Routing agrees closely between k6 and Prometheus. **The incident and dispatch
rows do not**, and the reason is instructive: the histogram buckets defined in
`http-metrics.js` are `…, 50, 100, 250, 500, …`. Both services' true p95 values
fall inside the single wide `100–250 ms` bucket, so Prometheus interpolates both
to 242.5 ms. In particular, **the Grafana dashboard would show incident-service
p95 at ~242 ms — under the 250 ms SLO, i.e. green — while k6's precise
measurement (271.55 ms) shows the SLO is actually breached.** This is a real
observability limitation, discussed under Interpretation below.

## Comparison against `docs/SLO.md`

| Service / path | SLO target | Sprint 5 p95 | Reliability | Verdict |
|---|---|---:|---:|:--|
| `regional-routing-service` `GET /route` | p95 ≤ 400 ms, ≥99% | 210.82 ms | 100% | ✅ **Both met** |
| `incident-service` `POST /incidents` | p95 ≤ 250 ms, ≥99% | 271.55 ms | 100% | ⚠️ **Latency not met**, reliability met |
| `responder-dispatch-service` `POST /dispatches` | p95 ≤ 500 ms, ≥99% | 208.45 ms | 100% | ✅ **Both met** |
| `emergency-gateway` `POST /requests` | p95 ≤ 300 ms, ≥99% | — | — | ➖ Not exercised (no such service exists in the built system) |

- **Routing — met (was failing in Sprint 3).** p95 dropped from 792 ms to
  211 ms, comfortably inside the 400 ms budget, and every request succeeded.
- **Incident — latency still not met, but far closer.** p95 improved from
  997 ms to 272 ms, yet the 250 ms target is missed. The `min` of 253 ms shows
  why: even a completely uncontended request cannot beat the fixed 250 ms floor
  (see Interpretation). Reliability was 100%.
- **Dispatch — met, now with large margin.** p95 fell from 486 ms (13 ms of
  margin in Sprint 3) to 208 ms (nearly 300 ms of margin). Reliability 100%.
- **`emergency-gateway`** is defined in `docs/SLO.md` but is not implemented as
  a separate service in this repo, so its intake SLO is not measured here. The
  effective front door for writes is `incident-service` via its ambassador.

## Comparison with the Sprint 3 load test

Sprint 3 ran the same three paths for 30s at 10 VUs (160 iterations, 480
requests). Sprint 5 ran 60s at 10 VUs (401 iterations, 1,203 requests).

| Metric | Sprint 3 → Sprint 5 (routing) | (incident) | (dispatch) |
|---|---|---|---|
| Error rate | 0.00% → 0.00% | 0.00% → 0.00% | 0.00% → 0.00% |
| p50 latency | 163.56 → **7.34 ms** | 299.94 → 262.10 ms | 210.40 → 202.95 ms |
| p95 latency | 792.05 → **210.82 ms** | 997.30 → **271.55 ms** | 486.17 → **208.45 ms** |
| p99 latency | 1,085.09 → **215.34 ms** | 2,527.10 → **276.31 ms** | 1,364.86 → **210.89 ms** |

**Error rate:** unchanged — 0% in both sprints on every path. The reliability
SLOs (≥99%) were never the problem; both runs passed all response checks.

**Latency:** improved dramatically on every path, and the tail collapsed most
of all. Sprint 3's p99 values ranged from ~1.1 s to ~2.5 s; Sprint 5's p99
values are all within ~5 ms of their p95. Two changes drive this, and one
caveat qualifies it:

1. **Async offload (Sprint 4).** `incident-service` now publishes notification
   work to RabbitMQ instead of doing it inline, so slow notification handling no
   longer inflates the incident request tail.
2. **Warm cache + longer run (routing).** Over 60s the five fixed test
   locations keep the Redis route cache warm, so routing is now bimodal: cache
   hits at ~7 ms (the 7.34 ms median) and the occasional miss/TTL-expiry at
   ~210 ms (the 200 ms `ROUTING_LATENCY_MS` floor). Sprint 3's shorter run and
   more cache misses produced a 163 ms median and an 792 ms p95.
3. **Caveat — environment.** The Sprint 3 report explicitly attributed its very
   long tails to "shared-container contention" while running three services in a
   Gantry devcontainer. This Sprint 5 run had far less host contention, so part
   of the tail improvement is environmental rather than purely architectural.
   The *direction* (lower, far more stable latency) is consistent with the
   async + caching + health-gated-readiness work, but the absolute tail
   reduction should not be read as a pure apples-to-apples architectural gain.

## Interpretation

**Where is the bottleneck?** The only missed SLO — incident-service p95 — is
bounded by a **fixed, artificial latency floor**, not by contention or capacity.
`incident-service` is configured with `INCIDENT_LATENCY_MS=200` and its
ambassador adds a 50 ms inspection delay, giving a 250 ms floor before any
network cost. The measured `min` of 253 ms confirms the path *starts* over its
own 250 ms budget. No amount of scaling, caching, or async work can pull p95
under 250 ms while that floor stands; the write path is latency-bound by design.

Everything else has comfortable headroom at this load. Routing is dominated by
cache hits (7 ms median); dispatch sits on its own 200 ms `DISPATCH_LATENCY_MS`
floor with a tiny tail. At 10 VUs with a 1 s sleep the system is nowhere near
saturation (routing median 7 ms), so this test proves **SLO conformance at
expected load**, not the saturation point.

A second, subtler bottleneck is in the **observability layer itself**: the
histogram buckets (`…100, 250, 500…`) are too coarse around the 250 ms and
300 ms SLO thresholds. The Grafana dashboard's p95 panel interpolates
incident-service to ~242 ms and would report the SLO as *met* when k6 shows it
*missed* by 21 ms. A dashboard that can't distinguish 242 ms from 272 ms at a
250 ms SLO boundary can mask exactly the marginal breaches it exists to catch.

**What I would change with another sprint:**

1. **Refine histogram buckets around the SLOs** (e.g. add edges at 150, 200,
   225, 250, 275, 300 ms) so the Grafana p95 matches k6 near the thresholds and
   the dashboard can't show a breached SLO as green.
2. **Attack the incident latency floor** — reduce the simulated 200 ms
   processing delay, drop the extra ambassador hop on the write path, or (if the
   250 ms delay is intended to model real work) renegotiate the SLO to ≥300 ms
   so the target is physically achievable.
3. **Run a ramping/stress profile** (e.g. 10 → 100 VUs) to find the real
   saturation point; this steady-state run can't reveal it.
4. **Add an exactly-once / idempotency stress test** (duplicate incident IDs and
   retried dispatches). Both `docs/SLO.md` invariants remain unmeasured because
   every synthetic request here uses a unique ID.

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/. -->
