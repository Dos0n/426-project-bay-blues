<!-- AI: This file was generated and later refined with AI assistance. See AI-DISCLOSURE.md, ai/chats/2026-08-11-205441-video-demo-austin-runbook.jsonl, and ai/chats/2026-08-12-072031-video-demo-board-specific-cues.jsonl. -->

# Austin's Two-Minute Architecture Demo

## Goal

- Explain one real design decision.
- Connect the decision to Bruce's request flow and Shri's live metrics.
- State both the measured benefit and the operational cost.
- Finish with the team's closing message.

## Figma setup

- Open the frames in order:
  [01 · Full System](https://www.figma.com/design/qeMEc6lXJnSA0CkRn3nbBb/Untitled?node-id=3-2) →
  [02 · Routing Decision](https://www.figma.com/design/qeMEc6lXJnSA0CkRn3nbBb/Untitled?node-id=3-3) →
  [03 · Benefit & Cost](https://www.figma.com/design/qeMEc6lXJnSA0CkRn3nbBb/Untitled?node-id=3-4).
- Fit each selected frame to the screen; avoid freehand zooming or panning.
- Use the named rows and cards below as pointer targets.

### Frame 1 — Full system

- Left: `Mobile client` phone.
- Top row: `Incident + Notification` → Incident Ambassador → Incident Service
  → RabbitMQ → Notification Worker.
- Middle row: `Regional Routing` → Routing Ambassador → Caddy → Route A/B/C →
  Redis.
- Bottom row: `Responder Dispatch` → Responder Dispatch → `One path, one job`.
- Footer takeaway: each request stays on one clear path.

### Frame 2 — Routing decision

- Main flow, left to right: Mobile client → Ambassador → Caddy →
  `Stateless × 3` → Redis.
- Blue evidence card: `Route lookup · p95 latency`, `297 ms → 63 ms`,
  `cache miss → cache hit`.
- Center evidence card: what the architecture changed.
- Mint evidence card: Grafana observes the result; it does not create it.

### Frame 3 — Benefit and cost

- Top result strip: measured p95 and the bounded simulation claim.
- Left column, `Why we chose it`: load distribution, replica isolation, shared
  cache.
- Right column, `What we now operate`: network hops, cache risk, and more
  failure modes.
- Bottom guardrail: simulation is not production; name missing safeguards only
  if time allows.

## Presentation cues

### 0:00–0:15 — Accept Shri's handoff

On screen:

- Frame 1, fitted to screen.
- Keep the pointer near the title until the handoff is complete.

Talking points:

- Bruce: proved the end-to-end request works.
- Shri: showed routing metrics moving under concurrent load.
- Austin: explains the design decision behind that behavior.

### 0:15–0:40 — Establish service boundaries

On screen:

- Start at the phone on the left.
- Trace the top, middle, and bottom rows in that order.
- End on `One path, one job` in the bottom-right card.

Talking points:

- Separate incident, routing, dispatch, and async-notification responsibilities.
- Scale and observe each path independently.
- Simulation uses explicit service boundaries instead of one large server.

### 0:40–1:10 — Explain replication

On screen:

- Advance to Frame 2.
- Trace Mobile client → Ambassador → Caddy → `Stateless × 3`.
- Pause on the three Route A/B/C boxes when saying “any healthy replica.”

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

- Move from Route A/B/C to the mint Redis card.
- Drop to the blue evidence card: `297 ms → 63 ms`.
- Point to `cache miss → cache hit` while naming the comparison.

Talking points:

- Redis is shared rather than local to one replica.
- One replica can calculate and cache a route.
- A different replica can serve the repeated lookup.
- Measured example: approximately `297 ms` miss to `63 ms` hit.

### 1:30–1:50 — State the trade-off

On screen:

- Advance to Frame 3.
- Point left for benefits, then right for costs.
- Finish on the `Simulation ≠ Production` guardrail.

Talking points:

- Benefit: responsiveness and availability.
- Cost: ambassador and load-balancer network hops.
- Cost: Redis expiration and stale-cache concerns.
- Cost: more containers, health checks, dashboards, and failure modes.
- Chosen because the course project needed measurable distributed behavior.

### 1:50–2:00 — Team closing

On screen:

- Stay on Frame 3.
- Hold on the top result strip during the first two bullets.
- End on the two-column benefit/cost comparison.

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

<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md, ai/chats/2026-08-11-205441-video-demo-austin-runbook.jsonl, and ai/chats/2026-08-12-072031-video-demo-board-specific-cues.jsonl. -->
