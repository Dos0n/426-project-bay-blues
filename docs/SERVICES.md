# Initial Service List

- `emergency-gateway`: Receives mobile emergency requests, validates their basic shape, preserves an idempotency key for safe retries, and forwards accepted requests into the incident workflow.
- `incident-service` (Owner: `@austinfairbanks`): Creates and tracks simulated emergency incidents, assigns each request an incident ID and severity level, and maintains the authoritative incident state.
- `regional-routing-service` (Owner: `@ShriRadhakrishnan1`): Maps an incident location and emergency type to the nearest campus/venue region and an eligible local response group via `GET /route` (query params: `latitude`, `longitude`, optional `emergencyType`).
- `regional-routing-ambassador` (Owner: `@ShriRadhakrishnan1`): Ambassador proxy in front of `regional-routing-service`; forwards lookups, applies timeout/retry under load, and logs each upstream attempt.
- `incident-ambassador` (Owner: `@Dos0n`): Ambassador proxy in front of `incident-service`; forwards `GET` and `POST` requests, retries safe (`GET`/`HEAD`) requests on timeout or 5xx, never retries `POST /incidents` to avoid duplicate incident creation, applies a simulated request-inspection delay via `setTimeout` before replying, and logs each upstream attempt.
- `responder-dispatch-service` (Owner: `@Dos0n`): Simulates notifying and assigning the appropriate security, medical, police, or crisis-response team via `POST /dispatches` (body: `incidentId`, `teamId`), tracks dispatch status through `GET /dispatches/:dispatchId` and `PATCH /dispatches/:dispatchId/status`, and lists the response-team roster via `GET /teams`.

## Sprint 2 Container Architecture

```mermaid
flowchart LR
    client[Phone / Web Client]

    subgraph compose[Docker Compose]
        incident[incident-service<br/>Host port 3001<br/>Create and retrieve incidents]
        incidentAmbassador[incident-ambassador<br/>Host port 3003<br/>Proxy, safe retries, and request logging]
        ambassador[regional-routing-ambassador<br/>Host port 3002<br/>Proxy, retries, timeout, and request logging]
        routing[regional-routing-service<br/>Internal port 3000<br/>Select region and response group]
        dispatch[responder-dispatch-service<br/>Host port 3004<br/>Assign and track responder teams]
    end

    client -->|POST /incidents<br/>GET /incidents/:incidentId| incident
    client -->|POST /incidents<br/>GET /incidents/:incidentId| incidentAmbassador
    incidentAmbassador -->|Forward through Compose DNS| incident
    client -->|GET /route<br/>GET /regions| ambassador
    ambassador -->|Forward through Compose DNS| routing
    client -->|POST /dispatches<br/>GET /dispatches/:dispatchId<br/>GET /teams| dispatch
```

The primary services are separate client-facing paths in Sprint 2;
`incident-service`, `regional-routing-service`, and
`responder-dispatch-service` do not call each other directly. Two of the
primary services have their own observable ambassador container sitting in
front of them: `incident-ambassador` proxies `incident-service`, and
`regional-routing-ambassador` proxies `regional-routing-service`.
`responder-dispatch-service` is reached directly, with no ambassador in
front of it.

Any pull request that adds, removes, or renames a service or infrastructure
container, or changes a connection between them, must update both the service
list and the Mermaid diagram above. The repository pull-request template
includes this as a required checklist item.
