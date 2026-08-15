<!-- AI: This file was generated with AI assistance. See AI-DISCLOSURE.md ("Sprint 4 Task 3: Bruce Dispatch Fault Injection") and ai/chats/dos0n-sprint4/2026-08-10-sprint4-task3-failure-scenario-chat.md. -->

# Sprint 4 Failure Scenario — responder-dispatch-service fault injection

Owner: `@Dos0n` · Affected service: `responder-dispatch-service` (host port `3004`)

This scenario makes Bruce's `responder-dispatch-service` fail or slow down on
demand and shows that the rest of the Blue Light system keeps working while it
is degraded.

## 1. What the failure scenario is

`responder-dispatch-service` has a built-in fault-injection switch with three
modes, controlled by the `DISPATCH_FAULT_MODE` environment variable and a
runtime `POST /admin/fault` endpoint:

- `off` (default) — normal operation.
- `error` — every business endpoint (`/teams`, `POST /dispatches`,
  `GET /dispatches/:id`, `PATCH /dispatches/:id/status`) returns
  `503 SERVICE_UNAVAILABLE`, and `GET /health` returns `503 {"status":"error"}`.
  This simulates the dispatch dependency being hard-down.
- `slow` — business endpoints add `DISPATCH_FAULT_LATENCY_MS` (default 6000 ms)
  on top of the normal `DISPATCH_LATENCY_MS`, while `GET /health` stays a fast
  `200`. This simulates an overloaded dependency that is still "up."

`GET /health` and `POST /admin/fault` are deliberately exempt from the fault so
Docker can still probe health and an operator can always toggle the fault back
off. Every fault action is observable in the container logs
(`dispatch_fault_mode_changed`, `dispatch_fault_injected`).

## 2. How to trigger it

Start the full system first:

```bash
docker compose up --build -d
```

Then either drive the whole scenario with the helper script:

```bash
./scripts/sprint-4-failure.sh
```

…or trigger it by hand at runtime (no rebuild needed):

```bash
# Break it
curl -fsS -X POST http://localhost:3004/admin/fault \
  -H 'Content-Type: application/json' --data '{"mode":"error"}'
curl -i -X POST http://localhost:3004/dispatches \
  -H 'Content-Type: application/json' \
  --data '{"incidentId":"f4957ac8-c9aa-47b0-b60d-e04ec9c25af2","teamId":"umpd-ems-north"}'

# Slow it, then heal it
curl -fsS -X POST http://localhost:3004/admin/fault -d '{"mode":"slow"}' -H 'Content-Type: application/json'
curl -fsS -X POST http://localhost:3004/admin/fault -d '{"mode":"off"}'  -H 'Content-Type: application/json'
```

It can also be injected at startup instead of at runtime:

```bash
DISPATCH_FAULT_MODE=error docker compose up -d --force-recreate responder-dispatch-service
```

## 3. How the system responds

- **`error` mode — fail fast, and the failure is visible.** Dispatch requests
  get an immediate, structured `503` instead of hanging. Because `GET /health`
  also returns `503`, the Compose healthcheck flips the container to
  `unhealthy`, so `docker compose ps` and any orchestrator can see the outage
  rather than routing traffic into a black hole.
- **`slow` mode — latency spikes behind a green health check.** `POST
  /dispatches` takes ~6.2 s while `/health` still answers `200` in a couple of
  milliseconds. This is the classic "shallow health check" blind spot: the
  container looks healthy but is blowing its latency SLO (`docs/SLO.md` targets
  p95 ≤ 500 ms for dispatch).
- **The rest of the system keeps working (fault isolation).** Dispatch is an
  independent, client-facing path with no other service depending on it, so
  while it is faulted:
  - `POST /incidents` through `incident-ambassador` still returns `201`,
  - the async path still runs — `incident-service` enqueues a RabbitMQ job and
    `emergency-notification-worker` logs `incident_notification_completed`,
  - `regional-routing-ambassador` still serves `/route` and `/health`.

  The dispatch outage does **not** cascade; the system degrades gracefully to
  "everything works except placing new responder dispatches."

## 4. What a production system would do differently

- **Resilient callers.** A real caller of dispatch would wrap it in a timeout,
  retries with exponential backoff and jitter, and a **circuit breaker** so it
  stops hammering a service that is returning `503`, plus a bulkhead so slow
  dispatch calls can't exhaust the caller's threads/connections and drag down
  unrelated work.
- **Orchestrator-driven recovery.** In Kubernetes/Nomad the failing liveness
  probe would restart or reschedule the container, and a **readiness** probe
  would pull it out of the load balancer so in-flight traffic drains instead of
  erroring. Production dispatch would sit behind a load balancer with multiple
  replicas (it has none today), so one bad replica wouldn't take the path down.
- **Deeper observability.** The `slow` case shows why production needs
  **latency-based SLO alerting** and **deep/dependency health checks**, not just
  a shallow `200`/`503` liveness ping — a service can be "healthy" and still
  failing users.
- **Don't drop the work.** If dispatch were mission-critical, requests could be
  made durable and retried through a queue (the same RabbitMQ pattern the
  notification path already uses) rather than returned as an error.
- **The fault switch itself.** `POST /admin/fault` is an unauthenticated
  simulation hook. In production it would be removed or locked down (internal
  network + auth), and failures would be exercised by a controlled
  chaos-engineering tool or service-mesh fault injection with an explicit,
  bounded blast radius — never an open endpoint on a live service.

## Recorded Validation

### Full Compose run — August 10, 2026

The complete stack started with all eleven containers healthy, and
`scripts/sprint-4-failure.sh` exercised the scenario end to end. In error mode,
Docker changed `responder-dispatch-service` from `healthy` to `unhealthy` while
incident creation, RabbitMQ notification processing, and a real `/route`
request continued to succeed. Restoring fault mode to `off` returned the
dispatch container to `healthy` and allowed new dispatches again.

```text
OFF    GET  /health          -> 200  {"status":"ok","service":"responder-dispatch-service"}      (0.003s)
OFF    POST /dispatches       -> 201  dispatchId assigned, status "assigned"                       (0.208s)

error  POST /admin/fault      -> 200  {"faultMode":"error","previousMode":"off"}
error  GET  /health          -> 503  {"status":"error","service":"responder-dispatch-service"}    (0.003s)
error  Docker health          -> unhealthy
error  POST /dispatches       -> 503  {"error":{"code":"SERVICE_UNAVAILABLE", ...}}                (0.002s)
error  GET  /teams            -> 503  {"error":{"code":"SERVICE_UNAVAILABLE", ...}}
error  GET  /route            -> 200  routed response with servedBy and regionId

slow   POST /admin/fault      -> 200  {"faultMode":"slow","previousMode":"error"}
slow   GET  /health          -> 200  {"status":"ok", ... "faultMode":"slow"}                       (0.002s)
slow   POST /dispatches       -> 201  (delayed)                                                    (6.208s)

off    POST /admin/fault      -> 200  {"faultMode":"off","previousMode":"slow"}
off    GET  /health          -> 200  {"status":"ok","service":"responder-dispatch-service"}        (0.002s)
off    Docker health          -> healthy
off    POST /dispatches       -> 201  (recovered)                                                  (0.206s)

bad    POST /admin/fault      -> 400  {"error":{"code":"VALIDATION_ERROR", "message":"mode must be one of: off, error, slow"}}
```

Observed log events (container stdout), confirming both the toggle and each
faulted request are observable:

```json
{"level":"warn","service":"responder-dispatch-service","event":"dispatch_fault_mode_changed","previousMode":"off","faultMode":"error"}
{"level":"warn","service":"responder-dispatch-service","event":"dispatch_fault_injected","faultMode":"error","method":"POST","path":"/dispatches"}
{"level":"warn","service":"responder-dispatch-service","event":"dispatch_fault_injected","faultMode":"slow","method":"POST","path":"/dispatches","extraLatencyMs":6000}
```

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/dos0n-sprint4/2026-08-10-sprint4-task3-failure-scenario-chat.md. -->
