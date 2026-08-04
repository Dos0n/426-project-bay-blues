<!-- AI: This file was generated with AI assistance. See ai/chats/austinf-sprint2/AI-DISCLOSURE.md. -->

# Incident Service API Contract

## Status and Scope

This document defines the Sprint 2 API contract for `incident-service`. The
service owns simulated incident records, assigns incident IDs, records optional
caller-supplied severity, defaults missing severity to `unassessed`, and
exposes those records over HTTP. Regional selection and responder dispatch are
owned by other services.

This is a simulation contract. It does not require a real database, external
API, authentication system, or real user data.

## Runtime Contract

- Internal container port: `3000`
- Default host port: `3001`
- Request and response media type: `application/json`
- `PORT` must be an integer from `1` through `65535`; its default is `3000`.
- `INCIDENT_LATENCY_MS` must be an integer from `0` through `10000`; its
  default is `200`.
- JSON request bodies are limited to 100 KB.
- Data endpoints receive simulated latency; `/health` does not.
- Reports originate from the phone-facing application or its web client. Since
  that source is invariant, incident records do not include a `source` field.

## Incident Representation

<!-- AI: The incident fields, enums, UUID/timestamp semantics, and validation limits were designed with AI assistance under student direction. -->

An incident has this JSON shape:

```json
{
  "incidentId": "550e8400-e29b-41d4-a716-446655440000",
  "emergencyType": "unknown",
  "severity": "unassessed",
  "status": "reported",
  "location": {
    "latitude": 42.3868,
    "longitude": -72.5301,
    "accuracyMeters": 12.5,
    "capturedAt": "2026-07-25T22:13:58.000Z"
  },
  "description": "Emergency assistance requested",
  "reportedAt": "2026-07-25T22:14:00.000Z",
  "updatedAt": "2026-07-25T22:14:00.000Z",
  "version": 1
}
```

Field contracts:

| Field | Type | Contract |
| --- | --- | --- |
| `incidentId` | UUID | Required server-assigned UUID v4 generated with `crypto.randomUUID()` and serialized as a JSON string. |
| `emergencyType` | enum | Optional operational category for downstream dispatch: `medical`, `fire`, `criminal`, `mental_health`, `other`, or `unknown`; defaults to `unknown`. |
| `severity` | enum | Optional at creation: `low`, `medium`, `high`, `critical`, or `unassessed`; defaults to `unassessed`. |
| `status` | enum | Required server-owned value: `reported`, `triaged`, `routed`, `dispatched`, `resolved`, or `cancelled`; initially `reported`. |
| `location` | object | Required actionable location for regional routing and responder dispatch. |
| `location.latitude` | number | Required; from `-90` through `90`. |
| `location.longitude` | number | Required; from `-180` through `180`. |
| `location.venue` | string | Optional non-empty simulated venue name with a maximum length of 200 characters. |
| `location.accuracyMeters` | number | Optional non-negative estimate of coordinate accuracy. |
| `location.capturedAt` | timestamp | Optional RFC 3339/ISO 8601 UTC timestamp in `YYYY-MM-DDTHH:mm:ss[.sss]Z` form describing when the coordinates were captured. |
| `description` | string | Optional synthetic description with a maximum length of 1,000 characters. |
| `reportedAt` | timestamp | Required server-assigned RFC 3339/ISO 8601 UTC timestamp captured when the POST request reaches the service. |
| `updatedAt` | timestamp | Required server-assigned timestamp; initially equal to `reportedAt`. |
| `version` | integer | Required positive record version; initially `1`. |

UUIDs and timestamps are serialized as JSON strings but retain the stronger
`uuid` and `date-time` semantic formats in this contract. Emergency type and
severity may be unknown during an urgent report, so clients may omit them. The
service normalizes missing values to `unknown` and `unassessed` rather than
rejecting the incident.

Clients do not supply `incidentId`, `status`, `reportedAt`, `updatedAt`, or
`version`. The service owns those fields.

## Read-Only Fixture Contract

The fixture file is `incident-service/data/incidents.json`.

- The JSON file contains an array of valid incident representations.
- Fixture incident IDs must be unique.
- The service loads the fixtures into an in-memory `Map` keyed by `incidentId`
  when it starts.
- The fixture file is read-only at runtime and is never rewritten by the
  service.
- `GET /incidents/:incidentId` reads from the in-memory index.
- `POST /incidents` may add a newly created incident to the runtime index, but
  it does not modify the fixture file.
- Runtime-created incidents disappear when the container restarts. The fixture
  records return on the next start, providing deterministic simulated data.

This gives the GET endpoint a stable pseudo-persistent data source without
introducing a database.

## `GET /health`

<!-- AI: The health, POST, GET, latency, storage, and error contracts below were drafted with AI assistance. -->

Reports whether the process is running and able to accept requests.

### Successful response

Status: `200 OK`

```json
{
  "status": "ok",
  "service": "incident-service"
}
```

The endpoint is cheap, deterministic, and has no simulated latency.

## `POST /incidents`

Creates a simulated incident in runtime memory.

### Request

```json
{
  "emergencyType": "medical",
  "severity": "high",
  "location": {
    "latitude": 42.3868,
    "longitude": -72.5301,
    "accuracyMeters": 12.5,
    "capturedAt": "2026-07-25T22:13:58.000Z"
  },
  "description": "Person requiring immediate medical assistance"
}
```

`location`, `location.latitude`, and `location.longitude` are required so the
system can route the incident and responders know where to go. Emergency type
and severity remain optional because they may not be known during an urgent
report.

The emergency-type values correspond to distinct downstream response targets:
medical services, the fire department, police, or mental-health crisis
responders. `other` and `unknown` allow reporting to proceed when none can be
selected confidently.

When supplied, the following validation applies:

- `emergencyType` and `severity` must match their enums.
- `location` must be a JSON object.
- Latitude and longitude must both be present and remain within their
  documented ranges.
- `location.accuracyMeters` must be non-negative.
- `location.capturedAt` must be a valid timestamp.
- `location.venue` must be a non-empty string of no more than 200 characters.
- `description` must be a non-empty string of no more than 1,000 characters.

Server-owned fields supplied by a client are ignored and replaced with values
assigned by the service.

### Successful response

Status: `201 Created`

Header: `Location: /incidents/{incidentId}`

Body: the complete created incident representation.

### Validation response

Status: `400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Incident request is invalid",
    "details": [
      "location.latitude is required"
    ]
  }
}
```

The successful and validation responses both receive simulated data-processing
latency.

## `GET /incidents/:incidentId`

Returns one incident from the runtime index.

### Successful response

Status: `200 OK`

Body: the complete incident representation.

### Unknown incident response

Status: `404 Not Found`

```json
{
  "error": {
    "code": "INCIDENT_NOT_FOUND",
    "message": "No incident was found for the supplied incident ID"
  }
}
```

Both successful and not-found lookups receive simulated database latency.

## General Error Responses

Malformed JSON receives `400 Bad Request`:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body contains invalid JSON"
  }
}
```

A JSON request body larger than 100 KB receives `413 Payload Too Large`:

```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request body exceeds the 100 KB limit"
  }
}
```

An unknown method or path receives `404 Not Found` with error code
`ROUTE_NOT_FOUND`. An unexpected server error receives `500 Internal Server
Error` with error code `INTERNAL_ERROR`; internal details are logged but are not
returned to the client.

## Sprint 2 Non-Goals

- Durable writes or a real database
- Database sharding or replication
- Searching by location, severity, or status
- Updating incident status
- Authentication or authorization
- Routing incidents to regions or responders
- Redis queues, metrics, retries, or failure recovery

These capabilities can be added in later sprints without changing the basic
incident representation or the three endpoint paths defined here.

<!-- AI: End AI-assisted file. See ai/chats/austinf-sprint2/AI-DISCLOSURE.md. -->
