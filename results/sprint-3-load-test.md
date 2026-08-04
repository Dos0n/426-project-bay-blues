<!-- AI: This file was substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/. -->

# Sprint 3 Load Test Results — routing and incident services

## Setup

The test ran from the Gantry devcontainer attached directly to the Compose
network. Each iteration exercised two public service paths:

1. `GET /route` through `regional-routing-ambassador`, Caddy, and the three
   `regional-routing-service` replicas.
2. `POST /incidents` through `incident-ambassador` to Austin's owned
   `incident-service`.

```bash
docker compose up --build -d
docker network connect <compose-network> <gantry-container>
BASE_URL=http://regional-routing-ambassador:3000 \
INCIDENT_BASE_URL=http://incident-ambassador:3000 \
k6 run --summary-export=results/k6-summary.json \
  load-tests/sprint-3-load.js
```

The script used 10 virtual users for 30 seconds with a one-second sleep after
each paired routing/incident iteration. It completed 200 iterations and 400
HTTP requests. Every request used synthetic fixture-compatible coordinates and
emergency types; every incident was created only in the service's in-memory
runtime state.

## Measured results

The per-service values come from custom k6 counters, Rates, and Trends so the
two different SLOs are not obscured by the combined HTTP distribution.

| Metric | `regional-routing-service` (`GET /route`) | `incident-service` (`POST /incidents`) |
|---|---:|---:|
| Requests | 200 | 200 |
| Request rate | 6.53 req/s | 6.53 req/s |
| Error rate | 0.00% | 0.00% |
| p50 latency | 126.30 ms | 299.90 ms |
| p95 latency | 391.25 ms | 623.12 ms |
| p99 latency | 533.15 ms | 904.13 ms |

Combined results were 400 requests at 13.07 req/s with a 0.00% HTTP error
rate. All 1,200 response checks passed: routing returned `200`, a `regionId`,
and a response group; incident creation returned `201`, a non-empty
`incidentId`, and the initial `reported` status.

## Comparison against `docs/SLO.md`

### `regional-routing-service`

- **Latency SLO met:** p95 was 391.25 ms against the 400 ms target.
- **Reliability SLO met:** all 200 routing requests succeeded, exceeding the
  99% target.

<!-- AI: Austin's individual Sprint 3 analysis compares the measured incident path with his owned service's SLOs. -->
### `incident-service`

- **Latency SLO not met:** p95 was 623.12 ms against the 250 ms target. The
  minimum observed end-to-end time was already 254.34 ms because the request
  includes the service's simulated 200 ms processing delay plus the
  ambassador's simulated 50 ms inspection delay and network overhead.
- **Reliability SLO met:** all 200 incident writes returned valid `201`
  responses, exceeding the 99% target. The incident checks passed 600/600.

The k6 process completed every iteration, but it reported a failed
`incident_create_duration` threshold because the latency SLO was missed. That
threshold failure is retained in `results/k6-run.log` rather than hidden.

## Interpretation

The updated run proves that Austin's service functions correctly in the full
system under concurrent load: all incident writes were accepted through the
ambassador and returned valid records. Reliability is currently stronger than
latency.

The incident path's main bottleneck is its fixed sequential latency budget.
The configured 200 ms service delay and 50 ms ambassador delay consume the
entire 250 ms p95 target before queueing or network variability is considered.
Under 10 concurrent users, the tail grew to 623 ms at p95 and 904 ms at p99.

The next change should either reduce those simulated delays or define the
250 ms SLO at the direct service boundary and add a separate end-to-end SLO for
the ambassador path. If higher concurrency still raises the tail after that,
the service will need a shared incident-state design before safe replication;
replicating its current in-memory mutable state would create inconsistent
reads. The routing path remained within its p95 SLO, while its p99 shows that
cold-cache and contention cases still deserve future stress testing.

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/. -->
