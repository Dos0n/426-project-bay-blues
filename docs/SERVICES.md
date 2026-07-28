# Initial Service List

- `emergency-gateway`: Receives mobile emergency requests, validates their basic shape, preserves an idempotency key for safe retries, and forwards accepted requests into the incident workflow.
- `incident-service` (Owner: `@austinfairbanks`): Creates and tracks simulated emergency incidents, assigns each request an incident ID and severity level, and maintains the authoritative incident state.
- `regional-routing-service` (Owner: `@ShriRadhakrishnan1`): Maps an incident location and emergency type to the nearest campus/venue region and an eligible local response group via `GET /route` (query params: `latitude`, `longitude`, optional `emergencyType`).
- `regional-routing-ambassador` (Owner: `@ShriRadhakrishnan1`): Ambassador proxy in front of `regional-routing-service`; forwards lookups, applies timeout/retry under load, and logs each upstream attempt.
- `responder-dispatch-service`: Simulates notifying and assigning the appropriate security, medical, police, or crisis-response team and records subsequent dispatch-status updates.

## Sprint 2 Container Architecture

```mermaid
flowchart LR
    client[Phone / Web Client]

    subgraph compose[Docker Compose]
        incident[incident-service<br/>Host port 3001<br/>Create and retrieve incidents]
        ambassador[regional-routing-ambassador<br/>Host port 3002<br/>Proxy, retries, timeout, and request logging]
        routing[regional-routing-service<br/>Internal port 3000<br/>Select region and response group]
    end

    client -->|POST /incidents<br/>GET /incidents/:incidentId| incident
    client -->|GET /route<br/>GET /regions| ambassador
    ambassador -->|Forward through Compose DNS| routing
```

The two primary services are separate client-facing paths in Sprint 2;
`incident-service` does not call `regional-routing-service`. The routing
ambassador is a separate observable container in front of the internal routing
service.

Any pull request that adds, removes, or renames a service or infrastructure
container, or changes a connection between them, must update both the service
list and the Mermaid diagram above. The repository pull-request template
includes this as a required checklist item.
