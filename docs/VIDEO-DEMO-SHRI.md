<!-- AI: This file was generated and later reformatted with AI assistance. See AI-DISCLOSURE.md, ai/chats/2026-08-11-204715-video-demo-shri-runbook-stacked.jsonl, and ai/chats/2026-08-11-205649-video-demo-bulletify-all-runbooks.jsonl. -->

# Shri's Two-Minute Grafana Demo

## Goal

- Apply the committed final workload live.
- Show Grafana changing while k6 is still running.
- Explain request rate, error rate, and p95 latency.
- Report the measured outcome honestly.
- Hand the architecture story to Austin.

## Dashboard scope

- Grafana observes `regional-routing-ambassador GET /route`.
- k6 also creates incidents and dispatches.
- Incident and dispatch traffic do not appear on this routing-only dashboard.
- Grafana observes behavior; it does not change or fix the system.

## Before recording

- Confirm Gantry is running.
- Confirm k6 is available:

  ```bash
  k6 version
  ```

- Open `http://localhost:3006`.
- Log in before recording.
  - Default username: `admin`
  - Default password: `admin`
- Handle any forced password-change prompt.
- Open **Dashboards → Regional routing — GET /route**.
- Set time range to **Last 5 minutes**.
- Keep auto-refresh at **5s**.
- Place Grafana and a large terminal side by side.
- Keep all three panels visible:
  - Request rate
  - Error rate
  - p95 latency
- Rehearse once.
- Allow rehearsal data to age outside the five-minute window if a clean graph is
  preferred.
- Do not manually import the dashboard or configure the datasource.

## Presentation cues

### 0:00–0:10 — Accept Bruce's handoff

On screen:

- Grafana and terminal side by side

Talking points:

- Bruce: one request completed end to end.
- Shri: concurrent load and live observability.
- Focus: public regional-routing path.

### 0:10–0:20 — Start k6 live

Action:

```bash
./scripts/demo-load.sh
```

Talking points:

- Existing committed Sprint 5 workload.
- Ten virtual users.
- Sixty-second duration.
- Gantry runs k6 on the active Compose network.
- Saved final-result artifacts remain unchanged.

### 0:20–0:50 — Request-rate panel

On screen:

- Request-rate graph rising
- k6 progress visible beside it

Talking points:

- Repeated `GET /route` requests.
- Requests enter through the routing ambassador.
- Caddy distributes work across three replicas.
- Panel reports requests per second.
- Rising line proves live load is reaching the instrumented path.

### 0:50–1:15 — Error-rate panel

On screen:

- Error-rate graph

Talking points:

- Percentage of non-2xx routing responses.
- Expected result under this workload: `0%`.
- Reliability measurement, not a claim that failure is impossible.

### 1:15–1:40 — p95-latency panel

On screen:

- p95-latency graph

Talking points:

- Ninety-five percent of routing requests finish at or below this value.
- More informative about slow users than a simple average.
- Routing SLO: p95 below `400 ms`.
- Recorded final routing p95: approximately `211 ms`.
- Leave Grafana visible for at least two five-second refreshes.

### 1:40–1:50 — Read the outcome honestly

On screen:

- k6 summary or live terminal progress

Outcome bullets:

- Routing: `0%` errors and latency SLO met.
- Separate incident path: reliable but narrowly above its latency target.
- Documented incident result: approximately `272 ms` versus `250 ms` SLO.
- A visible crossed incident threshold is a measured limitation, not a broken
  routing demo.

### 1:50–2:00 — Handoff to Austin

Talking points:

- Routing remained observable and responsive under load.
- Austin explains the design behind that behavior.
- Focus next: replication, shared Redis, and their cost.

## Recovery bullets

If Grafana is empty:

```bash
docker compose ps grafana prometheus regional-routing-ambassador
curl -fsS http://localhost:9090/-/healthy
curl -fsS http://localhost:3006/api/health
```

Then check:

- Dashboard time range includes now.
- Prometheus has had at least one five-second scrape.
- Grafana has had at least two refreshes.

If the launcher cannot find the network:

```bash
docker compose ps
./scripts/demo-health.sh
```

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md, ai/chats/2026-08-11-204715-video-demo-shri-runbook-stacked.jsonl, and ai/chats/2026-08-11-205649-video-demo-bulletify-all-runbooks.jsonl. -->
