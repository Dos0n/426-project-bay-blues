# Initial Service List

- `emergency-gateway`: Receives mobile emergency requests, validates their basic shape, preserves an idempotency key for safe retries, and forwards accepted requests into the incident workflow.
- `incident-service` (Owner: `@austinfairbanks`): Creates and tracks simulated emergency incidents, assigns each request an incident ID and severity level, and maintains the authoritative incident state.
- `regional-routing-service` (Owner: `@ShriRadhakrishnan1`): Maps an incident location and emergency type to the nearest campus/venue region and an eligible local response group via `GET /route` (query params: `latitude`, `longitude`, optional `emergencyType`).
- `regional-routing-ambassador` (Owner: `@ShriRadhakrishnan1`): Ambassador proxy in front of `regional-routing-service`; forwards lookups, applies timeout/retry under load, and logs each upstream attempt.
- `responder-dispatch-service`: Simulates notifying and assigning the appropriate security, medical, police, or crisis-response team and records subsequent dispatch-status updates.
