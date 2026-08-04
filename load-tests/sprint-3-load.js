// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
// AI: Austin's Sprint 3 individual test targets incident-service through its public ambassador path.
const INCIDENT_BASE_URL =
  __ENV.INCIDENT_BASE_URL || 'http://localhost:3003';
// AI: Bruce's Sprint 3 individual test targets his responder-dispatch-service directly because it has no ambassador.
const DISPATCH_BASE_URL =
  __ENV.DISPATCH_BASE_URL || 'http://localhost:3004';

// AI: Per-service metrics keep Austin's incident SLO evidence separate from the existing routing measurements.
const routingRequests = new Counter('routing_route_requests');
const routingFailures = new Rate('routing_route_failed');
const routingDuration = new Trend('routing_route_duration', true);
const incidentRequests = new Counter('incident_create_requests');
const incidentFailures = new Rate('incident_create_failed');
const incidentDuration = new Trend('incident_create_duration', true);
// AI: Separate dispatch metrics expose Bruce's service-level request count, reliability, and latency distribution.
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
  vus: 10,
  duration: '30s',
  // regional-routing-service SLOs from docs/SLO.md:
  // p95 latency <= 400ms; success rate >= 99% (error rate < 1%).
  // incident-service SLOs: p95 latency <= 250ms; success rate >= 99%.
  // responder-dispatch-service SLOs: p95 latency <= 500ms; success rate >= 99%.
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

  // AI: Each iteration creates a valid synthetic incident so Austin's owned service is exercised under the same load run.
  const incidentResponse = http.post(
    `${INCIDENT_BASE_URL}/incidents`,
    JSON.stringify({
      emergencyType,
      severity: 'high',
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        venue: 'Synthetic Sprint 3 load-test location',
      },
      description: 'Synthetic incident created by the Sprint 3 k6 load test',
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

  // AI: Each iteration submits a unique, valid dispatch so Bruce's owned service is measured under concurrent write load.
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
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
