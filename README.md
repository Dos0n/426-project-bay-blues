<!-- AI: This file was substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-10-155325-sprint-5-prometheus.jsonl. -->
# Blue Light

A simulated distributed emergency-response system built by Team 9 for COMPSCI
426. The system accepts incident reports, routes requests to an appropriate
regional response group, assigns responder teams, and publishes asynchronous
notification work.

## Team Roster

| GitHub Username | UMass Email |
| --- | --- |
| austinfairbanks | afairbanks@umass.edu |
| Dos0n | bdo@umass.edu |
| ShriRadhakrishnan1 | sradhakrishn@umass.edu |

## Domain Description

Our system simulates a distributed mobile blue-light emergency response network that routes emergency requests across multiple regions, including university campuses, transit hubs, stadiums, shopping centers, and other public venues. Users submit requests through a mobile application, and the system is responsible for determining the appropriate response, routing the request to the correct regional service, and keeping responders and users updated throughout the incident.

A single server becomes insufficient when the system experiences sudden spikes in demand, such as during large public events, severe weather, or multiple simultaneous emergencies. During these periods, the system must rapidly process incoming requests, determine user locations, prioritize incidents based on severity, and notify the appropriate local responders without introducing delays. Distributing the workload across multiple servers allows the system to remain responsive and available even under heavy load.

From a Computing for the Common Good perspective, a reliable emergency response system directly improves public safety. Students, commuters, event attendees, employees, and other members of the public all benefit from fast and dependable access to emergency services. When the system performs well, people receive timely police, medical, security, or crisis-response assistance. When it fails or becomes overloaded, delayed or misrouted requests can increase response times and potentially place people in dangerous situations. There are also inherent flaws with physical blue light alarms as they may not always be accessible during times of need, which makes being able to use blue light systems from one's phone the natural way to improve accessibility.

## Start the Complete System

Requirements:

- Docker with Docker Compose
- The course Gantry devcontainer

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

The `.env` copy is optional because every Compose variable has a local default,
but keeping one makes overrides explicit. Wait until `docker compose ps` shows
the services as healthy before sending requests. Stop the system with:

```bash
docker compose down
```

## Service Endpoints

| Component | Default host URL | Purpose |
| --- | --- | --- |
| Regional routing ambassador | `http://localhost:3002` | Public routing path, including `GET /route` |
| Incident ambassador | `http://localhost:3003` | Public incident path, including `POST /incidents` |
| Responder dispatch service | `http://localhost:3004` | Dispatch creation, lookup, and status updates |
| Notification worker HTTP server | `http://localhost:3005` | Worker health and metrics endpoints |
| Prometheus | `http://localhost:9090` | Metrics targets, queries, and graphs |
| RabbitMQ management | `http://localhost:15672` | Local queue administration |

The incident service, three routing replicas, Caddy, Redis, and RabbitMQ's
service ports are connected through Compose DNS and do not need public HTTP
ports. See [docs/SERVICES.md](docs/SERVICES.md) for the complete architecture.

## Prometheus Metrics

Every custom service exposes `GET /metrics` in Prometheus text format. The
endpoint includes:

- `http_requests_total`, labeled by service, method, normalized route, and
  status code.
- `http_request_duration_milliseconds`, a response-time histogram using
  millisecond buckets.

Prometheus scrapes eight running targets: the incident service and ambassador,
all three routing replicas, the routing ambassador, the dispatch service, and
the notification worker. Inspect their status at
`http://localhost:9090/targets`.

The main routing path can be queried with these PromQL expressions:

```promql
sum(rate(http_requests_total{service="regional-routing-ambassador",route="/route"}[1m]))
```

```promql
100 * (sum(rate(http_requests_total{service="regional-routing-ambassador",route="/route",status_code!~"2.."}[1m])) or vector(0))
  / clamp_min(sum(rate(http_requests_total{service="regional-routing-ambassador",route="/route"}[1m])), 0.000001)
```

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_request_duration_milliseconds_bucket{service="regional-routing-ambassador",route="/route"}[1m])
  )
)
```

The last expression returns milliseconds because the underlying histogram is
recorded in milliseconds.

## Environment Variables

All variables are optional. When a variable is missing, Compose uses the local
default shown below.

| Variable | Default | Purpose |
| --- | --- | --- |
| `INCIDENT_LATENCY_MS` | `200` | Simulated incident-service response latency |
| `ROUTING_AMBASSADOR_PORT` | `3002` | Routing ambassador host port |
| `ROUTING_LATENCY_MS` | `200` | Simulated routing-service miss latency |
| `ROUTING_UPSTREAM_URL` | `http://regional-routing-load-balancer:3000` | Routing ambassador upstream |
| `ROUTING_UPSTREAM_TIMEOUT_MS` | `2000` | Routing ambassador upstream timeout |
| `ROUTING_MAX_RETRIES` | `2` | Safe routing request retries |
| `ROUTE_CACHE_TTL_SECONDS` | `30` | Redis route-cache lifetime |
| `INCIDENT_AMBASSADOR_PORT` | `3003` | Incident ambassador host port |
| `INCIDENT_UPSTREAM_URL` | `http://incident-service:3000` | Incident ambassador upstream |
| `INCIDENT_UPSTREAM_TIMEOUT_MS` | `2000` | Incident ambassador upstream timeout |
| `INCIDENT_MAX_RETRIES` | `2` | Safe incident request retries |
| `INCIDENT_AMBASSADOR_PROCESSING_DELAY_MS` | `50` | Simulated ambassador processing overhead |
| `DISPATCH_SERVICE_PORT` | `3004` | Dispatch service host port |
| `DISPATCH_LATENCY_MS` | `200` | Simulated dispatch response latency |
| `RABBITMQ_USER` | `blue-light-app` | Local RabbitMQ username |
| `RABBITMQ_PASSWORD` | `blue-light-local-only` | Local-only RabbitMQ password |
| `RABBITMQ_AMQP_PORT` | `5672` | RabbitMQ AMQP host port |
| `RABBITMQ_MANAGEMENT_PORT` | `15672` | RabbitMQ management host port |
| `RABBITMQ_HEARTBEAT_SECONDS` | `60` | Producer and consumer heartbeat interval |
| `NOTIFICATION_WORKER_PORT` | `3005` | Notification worker HTTP host port |
| `NOTIFICATION_QUEUE` | `incident-notification-jobs` | Durable notification queue name |
| `NOTIFICATION_PROCESSING_MS` | `500` | Simulated worker processing time |
| `PROMETHEUS_PORT` | `9090` | Prometheus host port |

## Sprint 1 Deliverables

- [Project Description](docs/PROJECT.md)
- [Initial Service List](docs/SERVICES.md)
- [Service Level Objectives](docs/SLO.md)
<!-- AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-10-155325-sprint-5-prometheus.jsonl. -->
