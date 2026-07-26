# Initial Service List

- `emergency-gateway`: Receives mobile emergency requests, validates their basic shape, preserves an idempotency key for safe retries, and forwards accepted requests into the incident workflow.
<!-- AI: The incident-service ownership text and API-contract link were added with AI assistance. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl. -->
- `incident-service` (Owner: `@austinfairbanks`): Creates and tracks simulated emergency incidents, assigns each request an incident ID, records optional caller-supplied severity, defaults missing severity to `unassessed`, and maintains the authoritative incident state. See the [Incident Service API Contract](../incident-service/docs/API.md).
- `regional-routing-service`: Maps an incident to its campus, transit hub, stadium, or other venue region and selects the eligible local response group.
- `responder-dispatch-service`: Simulates notifying and assigning the appropriate security, medical, police, or crisis-response team and records subsequent dispatch-status updates.
