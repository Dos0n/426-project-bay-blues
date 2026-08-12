<!-- AI: This file was generated and later reformatted with AI assistance. See AI-DISCLOSURE.md, ai/chats/2026-08-11-203027-video-demo-runbook.jsonl, and ai/chats/2026-08-11-205649-video-demo-bulletify-all-runbooks.jsonl. -->

# Bruce's Two-Minute System Demo

## Goal

- Start the submitted instrumented system from a clean container state.
- Prove every Compose service is healthy and reachable.
- Demonstrate one coherent incident-to-dispatch request.
- Hand the running system to Shri for the live load test.

## Before recording

- Run the full sequence once.
- Ensure images are already built or downloaded.
- Increase the terminal font size.
- Keep one terminal and this cue sheet visible.
- Stop existing project containers:

  ```bash
  cd 426-project--bay-blues-
  docker compose down --remove-orphans
  ```

## Presentation cues

### 0:00–0:10 — Introduce Blue Light

On screen:

- Clean terminal in the project root

Talking points:

- Distributed mobile emergency-response simulation.
- Incident, regional-routing, notification, and dispatch services.
- Goal: prove the submitted system starts and serves a real request.

### 0:10–0:30 — Start from a clean state

Action:

```bash
docker compose up -d
```

Talking points:

- One command starts the complete instrumented system.
- Same Compose state submitted in the repository.

### 0:30–0:40 — Show the containers

Action:

```bash
docker compose ps
```

Talking points:

- Application services and ambassadors.
- Three routing replicas behind Caddy.
- Redis and RabbitMQ.
- Prometheus and Grafana.
- `health: starting` is acceptable here; the next command waits for readiness.

### 0:40–1:10 — Check every service

Action:

```bash
./scripts/demo-health.sh
```

Talking points:

- Thirteen separate service checks.
- HTTP checks for application and observability services.
- Native checks for Redis and RabbitMQ.
- More evidence than container process state alone.

Expected result:

- `PASS` for all 13 Compose services.

### 1:10–1:50 — Run the emergency-request flow

Action:

```bash
./scripts/demo-incident-flow.sh
```

Talking points:

- Script acts as the simulated phone client.
- Create incident through the incident ambassador.
- Pass returned location and emergency type to the routing ambassador.
- Routing service selects a region and response group.
- Send real `incidentId` and selected `teamId` to dispatch.
- Read the saved dispatch back by `dispatchId`.

Expected proof:

- Generated incident UUID.
- North Campus route.
- Named routing replica and cache status.
- UMPD / EMS North assignment.
- Assigned status and simulated ETA.
- Final `PASS  incident -> routing -> dispatch`.

### 1:50–2:00 — Handoff to Shri

Talking points:

- One request completed end to end.
- System remains running and instrumented.
- Shri will apply concurrent load.
- Grafana will show the same routing path live.

## Recovery bullets

If a service fails:

```bash
docker compose ps
docker compose logs --tail 50 SERVICE_NAME
```

If the demo needs a clean restart:

```bash
docker compose down --remove-orphans
docker compose up -d
./scripts/demo-health.sh
```

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md, ai/chats/2026-08-11-203027-video-demo-runbook.jsonl, and ai/chats/2026-08-11-205649-video-demo-bulletify-all-runbooks.jsonl. -->
