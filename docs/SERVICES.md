# Initial Service List

- `emergency-gateway`: Receives mobile emergency requests, validates their basic shape, preserves an idempotency key for safe retries, and forwards accepted requests into the incident workflow.
- `incident-service` (Owner: `@austinfairbanks`): Creates and tracks simulated emergency incidents, assigns each request an incident ID and severity level, and maintains the authoritative incident state.
- `regional-routing-service`: Maps an incident to its campus, transit hub, stadium, or other venue region and selects the eligible local response group.
- `responder-dispatch-service`: Simulates notifying and assigning the appropriate security, medical, police, or crisis-response team and records subsequent dispatch-status updates.
