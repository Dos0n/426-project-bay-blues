<!-- AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl. -->

# Bruce's Two-Minute Video Demo

This runbook covers the first two minutes of the final project video: clean
Compose startup, individual service checks, and one complete Blue Light request.

## Before recording

Run the complete sequence once, confirm Docker has already downloaded or built
the images, and increase the terminal font size. Then stop the stack so the
recording begins from a clean container state:

```bash
cd 426-project--bay-blues-
docker compose down --remove-orphans
```

Keep only this runbook and one large terminal window visible during the demo.

## Recording sequence

### 1. Introduce the system

Suggested line:

> Blue Light simulates a mobile emergency request traveling through distributed
> incident, regional-routing, notification, and responder-dispatch services.

### 2. Start from a clean state

```bash
docker compose up -d
```

Suggested line:

> The complete instrumented system starts with one Docker Compose command.

### 3. Show every container

```bash
docker compose ps
```

Suggested line:

> Compose has started the application services, proxies, replicated routing
> path, Redis, RabbitMQ, Prometheus, and Grafana.

Some containers may still display `health: starting`. The next command waits
for all thirteen services and then checks each one using its HTTP or native
health protocol.

### 4. Check every service separately

```bash
./scripts/demo-health.sh
```

Suggested line:

> Every service is now healthy and reachable through its real protocol, not
> merely listed as a running container.

### 5. Run the end-to-end request

```bash
./scripts/demo-incident-flow.sh
```

Suggested narration while the script runs:

> This script acts as the simulated phone client. It reports a medical incident
> through the incident ambassador, passes the returned location and emergency
> type to the routing ambassador, and sends the selected response-group ID with
> the real incident ID to the dispatch service. Finally, it reads the saved
> dispatch back to verify the assignment.

The services do not bypass their existing API boundaries. The demo client
coordinates the flow by extracting `incidentId` from incident creation and
`responseGroup.id` from routing before submitting the dispatch request.

Expected final output:

```text
BLUE LIGHT REQUEST COMPLETED

Incident:  <generated UUID> — medical emergency
Region:    North Campus
Routed by: regional-routing-service-<replica> (MISS or HIT)
Team:      UMPD / EMS North
Dispatch:  assigned — ETA <minutes> minutes

PASS  incident -> routing -> dispatch
```

### 6. Handoff to Shri

Suggested line:

> We have shown one request end to end. Shri will now apply concurrent load and
> show how the same instrumented paths appear live in Grafana.

## Recovery commands

If the health script reports a failure, inspect the service named in the error:

```bash
docker compose ps
docker compose logs --tail 50 SERVICE_NAME
```

Restart from a clean container state if needed:

```bash
docker compose down --remove-orphans
docker compose up -d
./scripts/demo-health.sh
```

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-11-203027-video-demo-runbook.jsonl. -->
