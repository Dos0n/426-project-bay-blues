<!-- AI: This design contract was created with AI assistance. See AI-DISCLOSURE.md and ai/chats/ for disclosure records. -->
# Sprint 4 Asynchronous Notification Design Contract

## Status and Scope

Status: accepted for incremental implementation and review.

This contract covers Sprint 4 Task 1: adding one observable RabbitMQ work
queue to the Blue Light simulation. It defines the intended behavior before
implementation so each review gate can be checked against the same decisions.
Health-check changes to existing services, the scripted failure report, and the
complete Sprint 4 diagram remain separate deliverables unless a change is
required to support this async path.

## Current Baseline

The current `incident-service` validates `POST /incidents`, creates an incident,
stores it in an in-memory `Map`, and returns `201 Created`. No service receives
follow-up work. The incident, routing, and dispatch paths are independent, and
the system has no message broker or notification worker.

## Chosen Architecture

RabbitMQ will carry notification jobs from `incident-service` to a new
standalone `emergency-notification-worker`:

```text
Phone / Web Client
       |
       | POST /incidents
       v
incident-ambassador
       |
       | synchronous HTTP
       v
incident-service ---- persistent job ----> RabbitMQ
       |                                     |
       | 201 Created                         | one consumer receives each job
       v                                     v
     Client                    emergency-notification-worker
```

RabbitMQ is appropriate because one notification job should be processed by
one worker. Kafka pub/sub is not used because Task 1 does not require multiple
independent consumer groups to receive every incident event. The routing path
is unchanged because route selection must remain a synchronous, stateless
lookup.

## Component Responsibilities

### `incident-service` producer

- Trigger only after a valid `POST /incidents` request creates an incident.
- Never publish for health checks, incident lookups, or rejected requests.
- Maintain one long-lived RabbitMQ connection and confirm channel per process.
- Declare the durable queue during startup.
- Publish a persistent JSON job and wait only for broker confirmation.
- Log the job ID and incident ID when RabbitMQ confirms the publish.
- Preserve the existing successful `201` response body and location header.
- Never call the worker directly.

### RabbitMQ broker

- Run as infrastructure in the root `docker-compose.yml`.
- Store the durable `incident-notification-jobs` queue.
- Persist broker data in a named Compose volume.
- Report application readiness through `rabbitmq-diagnostics -q check_running`.
- Hold ready messages while the worker is unavailable.
- Redeliver a message if its consumer disconnects before acknowledging it.

### `emergency-notification-worker` consumer

- Run as a new standalone custom service, as required for a three-person team.
- Maintain one long-lived RabbitMQ connection and channel.
- Declare the same durable queue and request one unacknowledged job at a time
  with `prefetch(1)`.
- Parse and validate each job envelope.
- Log when a job is received and when simulated notification processing ends.
- Acknowledge a valid message only after processing completes.
- Reject malformed messages without requeueing them, preventing an infinite
  poison-message loop.
- Expose `GET /health` for Docker; no business endpoint is client-facing.

## Queue and Message Contract

- Queue name: `incident-notification-jobs`
- Queue durability: durable
- Message persistence: persistent
- Content type: `application/json`
- Delivery model: at least once
- Consumer concurrency per worker: one unacknowledged message

Example payload:

```json
{
  "schemaVersion": 1,
  "jobId": "74eea03f-6960-4a7a-a626-9cdedd576ab7",
  "type": "incident.notification.requested",
  "incidentId": "f4957ac8-c9aa-47b0-b60d-e04ec9c25af2",
  "emergencyType": "medical",
  "severity": "critical",
  "reportedAt": "2026-08-06T19:00:00.000Z"
}
```

The job deliberately excludes free-text descriptions and exact coordinates.
The simulated worker needs only classification and correlation fields, so
including more incident data would add unnecessary sensitive information.

## Request and Failure Semantics

The worker's processing is asynchronous, but broker acceptance is part of the
incident-creation request:

```text
validate -> construct incident -> publish and confirm -> store -> return 201
```

If RabbitMQ cannot confirm the publish, the request returns `503` and the new
incident is not added to the in-memory map. The client never waits for the
worker to process the notification.

RabbitMQ provides at-least-once delivery, not exactly-once processing. A worker
can finish its simulated effect and disconnect before its acknowledgment
reaches RabbitMQ, causing redelivery. Logs therefore use `jobId` for
correlation, and a production notification provider would use that value as an
idempotency key.

The in-memory incident map and RabbitMQ publish are not one atomic transaction.
A production design would use durable incident storage plus a transactional
outbox. Adding a database or outbox is intentionally outside this sprint's
approved scope.

## Configuration Contract

Compose supplies the broker hostname, credentials, heartbeat interval, queue
name, and simulated processing delay through environment variables. Local
development defaults are documented in `.env.example`; source code does not
contain credentials and must not log the connection URL or password.

Both `incident-service` and `emergency-notification-worker` will use
`depends_on: rabbitmq: condition: service_healthy`. Redis remains solely the
Sprint 3 route cache and is not reused as the Sprint 4 broker.

## Structured Observability

The minimum observable events are:

- `incident_notification_enqueued` from `incident-service`.
- `incident_notification_received` from the worker.
- `incident_notification_completed` from the worker.
- `incident_notification_rejected` for a malformed message.

Each job event includes `jobId` and `incidentId`. Logs do not include incident
descriptions, coordinates, credentials, or the complete message body.

## Review Gates and Acceptance Criteria

1. **Broker:** RabbitMQ starts through Compose, becomes healthy, uses a named
   data volume, and exposes its management interface for local inspection.
2. **Consumer:** the standalone worker becomes healthy, connects once, and is
   visible as a consumer waiting on `incident-notification-jobs`.
3. **Producer:** one valid `POST /incidents` produces one enqueue log and one
   persistent message; invalid and read-only requests produce none.
4. **End to end:** the worker logs receipt and completion, acknowledges the
   message, and later processes work queued while it was stopped.
5. **Regression and documentation:** existing incident, routing, caching,
   Caddy, ambassador, and dispatch paths still work; the service list, complete
   diagram, AI disclosure, and raw session record are updated.

## Non-Goals

- Real SMS, email, mobile push, or emergency-dispatch integrations.
- Kafka topics or multiple subscriber groups.
- Automatic worker autoscaling.
- A dead-letter queue or retry scheduler.
- Exactly-once delivery.
- Durable incident database storage or a transactional outbox.
- Moving regional routing or responder dispatch into the notification worker.

<!-- AI: End AI-assisted design contract. See AI-DISCLOSURE.md and ai/chats/ for disclosure records. -->
