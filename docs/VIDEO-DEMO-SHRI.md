<!-- AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-11-204715-video-demo-shri-runbook-stacked.jsonl. -->

# Shri's Two-Minute Grafana Demo

This runbook begins immediately after Bruce's healthy-stack and end-to-end
request demonstration. It shows live Grafana movement while the committed final
k6 workload runs.

## What this segment proves

- k6 creates concurrent traffic against the running Compose system.
- Prometheus scrapes the instrumented services every five seconds.
- Grafana refreshes live request rate, error rate, and p95 latency for the
  public routing path.

The provisioned dashboard observes only
`regional-routing-ambassador GET /route`. The k6 workload also creates incidents
and dispatches, but those two paths do not appear in this dashboard.

## Before recording

Complete these steps before anyone records:

1. Confirm the Gantry devcontainer is running and already provides k6:

   ```bash
   k6 version
   ```

2. Open `http://localhost:3006` and log in. The default credentials are
   `admin` / `admin`; handle any password-change prompt before recording.
3. Open **Dashboards → Regional routing — GET /route**.
4. Set the time range to **Last 5 minutes** and leave auto-refresh at **5s**.
5. Arrange Grafana and a large terminal side by side. Keep all three panels
   visible: request rate, error rate, and p95 latency.
6. Rehearse `./scripts/demo-load.sh` once, then let those metrics age outside the
   five-minute window before the final recording if you want a cleaner graph.

Do not manually reconfigure the datasource or import the dashboard. Both are
provisioned by Compose and must be shown in the repository's submitted state.

## Recording sequence

### 1. Accept Bruce's handoff

Suggested line:

> Bruce showed one request moving through the system. I will now run our
> committed final workload and show how the routing path behaves under
> concurrent traffic.

### 2. Start k6 live

Run this command on camera:

```bash
./scripts/demo-load.sh
```

The wrapper discovers the active Compose network, temporarily connects the
Gantry devcontainer when necessary, and runs its included k6 against
`load-tests/sprint-5-load.js`. The committed test uses 10 virtual users for 60
seconds and does not overwrite the saved final results.

### 3. Explain the moving Grafana panels

As the panels update, use these cues:

- **Request rate:**

  > The request-rate line rises because k6 is repeatedly calling `GET /route`
  > through the routing ambassador, Caddy, and our three routing replicas.

- **Error rate:**

  > The error-rate panel tracks non-2xx routing responses. It should remain at
  > zero while the system handles this workload successfully.

- **p95 latency:**

  > p95 is the response time at or below which 95 percent of routing requests
  > complete. It shows the slower end of the user experience, not just an
  > average that can hide slow requests.

Keep Grafana visible long enough for at least two refreshes so the viewer can
clearly see live movement rather than a static dashboard.

### 4. Read the k6 result accurately

When the run finishes, the terminal may report the documented incident-latency
threshold as crossed. That is an honest measured result, not a failed demo: the
final report records 0% HTTP errors, a routing p95 around 211 ms within its
400 ms SLO, and an incident p95 around 272 ms just above its 250 ms SLO.

Suggested line if the crossed threshold is visible:

> The routing path shown in Grafana remained reliable and met its latency SLO.
> Our separate incident path stayed reliable but narrowly missed its latency
> target, which we document as a design limitation rather than hiding it.

### 5. Handoff to Austin

Suggested line:

> The live data shows that the routing path remains observable and responsive
> under load. Austin will explain the replication and shared-cache decisions
> behind that behavior, including their cost.

## Recovery directions

If Grafana is empty:

```bash
docker compose ps grafana prometheus regional-routing-ambassador
curl -fsS http://localhost:9090/-/healthy
curl -fsS http://localhost:3006/api/health
```

Then confirm the dashboard time range includes the current time and wait at
least ten seconds for a Prometheus scrape plus two Grafana refreshes.

If the wrapper cannot find the Compose network, confirm Bruce's stack is still
running:

```bash
docker compose ps
./scripts/demo-health.sh
```

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-11-204715-video-demo-shri-runbook-stacked.jsonl. -->
