// AI: This file was generated with AI assistance for Sprint 5. See AI-DISCLOSURE.md and ai/chats/.
// AI: Sprint 5's final load test reuses the Sprint 3 workload so the two runs are directly
// comparable. It exercises the same three paths against the now fully instrumented system
// (Prometheus /metrics, structured logging) and runs for 60s at 10 VUs, up from 30s in Sprint 3.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// AI: The primary/main service path is GET /route through the routing ambassador — the same path
// the committed Grafana dashboard (grafana/dashboards/routing-main-path.json) reports on.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
// AI: The incident create path runs through incident-ambassador, matching the Sprint 3 run.
const INCIDENT_BASE_URL =
  __ENV.INCIDENT_BASE_URL || 'http://localhost:3003';
// AI: responder-dispatch-service is measured directly because it has no ambassador.
const DISPATCH_BASE_URL =
  __ENV.DISPATCH_BASE_URL || 'http://localhost:3004';

// AI: Per-service metrics keep each SLO's evidence separate from the combined HTTP distribution.
const routingRequests = new Counter('routing_route_requests');
const routingFailures = new Rate('routing_route_failed');
const routingDuration = new Trend('routing_route_duration', true);
const incidentRequests = new Counter('incident_create_requests');
const incidentFailures = new Rate('incident_create_failed');
const incidentDuration = new Trend('incident_create_duration', true);
const dispatchRequests = new Counter('dispatch_create_requests');
const dispatchFailures = new Rate('dispatch_create_failed');
const dispatchDuration = new Trend('dispatch_create_duration', true);

// Campus region centers from regional-routing-service/data/regions.json.
const LOCATIONS = [
  { latitude: 42.3912, longitude: -72.5267 }, // North Campus
  { latitude: 42.3845, longitude: -72.5283 }, // Central Transit Hub
  { latitude: 42.3881, longitude: -72.5239 }, // Riverside Stadium
  { latitude: 42.3827, longitude: -72.5321 }, // Community Wellness Center
  { latitude: 42.3863, longitude: -72.5354 }, // Eastside Shopping Center
];

// Supported emergencyType values from the routing service fixtures.
const EMERGENCY_TYPES = [
  'medical',
  'fire',
  'criminal',
  'mental_health',
  'other',
  'unknown',
];

// AI: These fixture-backed IDs keep every synthetic dispatch valid without adding a setup request to the measured workload.
const RESPONSE_TEAM_IDS = [
  'umpd-ems-north',
  'umpd-north',
  'fire-ems-north',
  'crisis-north',
  'umpd-transit',
  'ems-transit',
  'fire-transit',
  'crisis-transit',
  'event-security-stadium',
  'ems-stadium',
];

// AI: k6 does not expose Node's crypto.randomUUID(), so the test generates RFC 4122 v4-shaped synthetic incident IDs locally.
const uuidV4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

export const options = {
  // AI: Sprint 5 requires >= 60s at >= 10 VUs; Sprint 3 ran 30s at 10 VUs.
  vus: 10,
  duration: '60s',
  // Service SLOs from docs/SLO.md:
  // regional-routing-service GET /route: p95 latency <= 400ms; success rate >= 99%.
  // incident-service POST /incidents:    p95 latency <= 250ms; success rate >= 99%.
  // responder-dispatch-service POST /dispatches: p95 latency <= 500ms; success rate >= 99%.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    routing_route_duration: ['p(95)<400'],
    routing_route_failed: ['rate<0.01'],
    incident_create_duration: ['p(95)<250'],
    incident_create_failed: ['rate<0.01'],
    dispatch_create_duration: ['p(95)<500'],
    dispatch_create_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

export default function () {
  const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const emergencyType =
    EMERGENCY_TYPES[Math.floor(Math.random() * EMERGENCY_TYPES.length)];

  // AI: Primary path — GET /route through the routing ambassador, Caddy, and the three replicas.
  const url =
    `${BASE_URL}/route` +
    `?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&emergencyType=${emergencyType}`;

  const routingResponse = http.get(url, {
    tags: { name: 'routing_route' },
  });
  routingRequests.add(1);
  routingDuration.add(routingResponse.timings.duration);

  let routingBody;
  try {
    routingBody = routingResponse.json();
  } catch {
    routingBody = null;
  }

  const routingPassed = check(routingResponse, {
    'status is 200': (r) => r.status === 200,
    'route returns regionId': () =>
      routingBody !== null &&
      typeof routingBody.regionId === 'string' &&
      routingBody.regionId.length > 0,
    'route returns responseGroup': () =>
      routingBody !== null &&
      routingBody.responseGroup !== undefined &&
      typeof routingBody.responseGroup.id === 'string',
  });
  routingFailures.add(!routingPassed);

  // AI: Each iteration creates a valid synthetic incident so the incident write path is exercised under the same load run.
  const incidentResponse = http.post(
    `${INCIDENT_BASE_URL}/incidents`,
    JSON.stringify({
      emergencyType,
      severity: 'high',
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        venue: 'Synthetic Sprint 5 load-test location',
      },
      description: 'Synthetic incident created by the Sprint 5 k6 load test',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'incident_create' },
    },
  );
  incidentRequests.add(1);
  incidentDuration.add(incidentResponse.timings.duration);

  let incidentBody;
  try {
    incidentBody = incidentResponse.json();
  } catch {
    incidentBody = null;
  }

  const incidentPassed = check(incidentResponse, {
    'incident status is 201': (r) => r.status === 201,
    'incident returns incidentId': () =>
      incidentBody !== null &&
      typeof incidentBody.incidentId === 'string' &&
      incidentBody.incidentId.length > 0,
    'incident starts reported': () =>
      incidentBody !== null && incidentBody.status === 'reported',
  });
  incidentFailures.add(!incidentPassed);

  // AI: Each iteration submits a unique, valid dispatch so the dispatch write path is measured under concurrent load.
  const teamId =
    RESPONSE_TEAM_IDS[Math.floor(Math.random() * RESPONSE_TEAM_IDS.length)];
  const dispatchResponse = http.post(
    `${DISPATCH_BASE_URL}/dispatches`,
    JSON.stringify({ incidentId: uuidV4(), teamId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'dispatch_create' },
    },
  );
  dispatchRequests.add(1);
  dispatchDuration.add(dispatchResponse.timings.duration);

  let dispatchBody;
  try {
    dispatchBody = dispatchResponse.json();
  } catch {
    dispatchBody = null;
  }

  const dispatchPassed = check(dispatchResponse, {
    'dispatch status is 201': (r) => r.status === 201,
    'dispatch returns dispatchId': () =>
      dispatchBody !== null &&
      typeof dispatchBody.dispatchId === 'string' &&
      dispatchBody.dispatchId.length > 0,
    'dispatch starts assigned to requested team': () =>
      dispatchBody !== null &&
      dispatchBody.status === 'assigned' &&
      dispatchBody.team !== undefined &&
      dispatchBody.team.teamId === teamId,
  });
  dispatchFailures.add(!dispatchPassed);

  sleep(1);
}
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/.
