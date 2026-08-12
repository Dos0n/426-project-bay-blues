<!-- AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-11-205441-video-demo-austin-runbook.jsonl. -->

# Austin's Two-Minute Architecture Demo

## Goal

- Explain one real design decision.
- Connect the decision to Bruce's request flow and Shri's live metrics.
- State both the measured benefit and the operational cost.
- Finish with the team's closing message.

## Figma setup

- Use presentation mode with three linked frames.
- Reuse the existing service diagram as the visual foundation.
- Make each click move to a prepared frame; avoid freehand zooming or panning.
- Keep labels large enough for a compressed video.
- The talking points depend only on the three concepts below, not exact node
  positions or styling.

### Frame 1 — Full system

- Mobile client
- Incident + notification path
- Regional-routing path
- Responder-dispatch path
- Visual emphasis: separation of responsibilities

### Frame 2 — Routing decision

- Routing ambassador
- Caddy load balancer
- Three stateless routing replicas
- Shared Redis cache
- Visual emphasis: one stable entry point and interchangeable healthy replicas

### Frame 3 — Benefit and cost

- Benefit: load distribution
- Benefit: failed-replica isolation
- Benefit: shared cache across replicas
- Evidence: route lookup approximately `297 ms -> 63 ms`
- Cost: additional containers and network hops
- Cost: cache expiration and stale-data risk
- Cost: more health checks, metrics, and failure modes

## Presentation cues

### 0:00–0:15 — Accept Shri's handoff

On screen:

- Frame 1: full system

Talking points:

- Bruce: proved the end-to-end request works.
- Shri: showed routing metrics moving under concurrent load.
- Austin: explains the design decision behind that behavior.

### 0:15–0:40 — Establish service boundaries

On screen:

- Frame 1: highlight each major path

Talking points:

- Separate incident, routing, dispatch, and async-notification responsibilities.
- Scale and observe each path independently.
- Simulation uses explicit service boundaries instead of one large server.

### 0:40–1:10 — Explain replication

On screen:

- Advance to Frame 2.
- Highlight ambassador, Caddy, and replicas.

Talking points:

- Regional routing is stateless.
- Each request carries location and emergency type.
- Any healthy replica can compute the route.
- Routing ambassador provides one stable client entry point.
- Ambassador adds logging, timeout, and retry behavior.
- Caddy distributes requests across healthy replicas.
- Caddy can remove an unhealthy replica while the others continue serving.

### 1:10–1:30 — Explain the shared cache

On screen:

- Frame 2: highlight Redis and replica-to-cache connections.

Talking points:

- Redis is shared rather than local to one replica.
- One replica can calculate and cache a route.
- A different replica can serve the repeated lookup.
- Measured example: approximately `297 ms` miss to `63 ms` hit.

### 1:30–1:50 — State the trade-off

On screen:

- Advance to Frame 3.

Talking points:

- Benefit: responsiveness and availability.
- Cost: ambassador and load-balancer network hops.
- Cost: Redis expiration and stale-cache concerns.
- Cost: more containers, health checks, dashboards, and failure modes.
- Chosen because the course project needed measurable distributed behavior.

### 1:50–2:00 — Team closing

On screen:

- Frame 3 or a final Blue Light title card

Closing bullets:

- Reproducible Compose startup.
- End-to-end emergency-request flow.
- Live behavior under concurrent load.
- Better responsiveness and availability.
- Explicit cost: infrastructure and operational complexity.

## Accuracy guardrails

- Say **ambassadors**, not sidecars; the final system has two ambassadors and no
  sidecar.
- Do not claim that Grafana changes system behavior; it observes the system.
- Do not claim production readiness.
- Name missing production capabilities only if time allows:
  - authentication
  - durable incident history
  - protected location data
  - real responder integrations
- Explain one decision deeply instead of listing every course pattern.

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-11-205441-video-demo-austin-runbook.jsonl. -->
