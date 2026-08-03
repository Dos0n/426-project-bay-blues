// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

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

export const options = {
  vus: 10,
  duration: '30s',
  // regional-routing-service SLOs from docs/SLO.md:
  // p95 latency <= 400ms; success rate >= 99% (error rate < 1%).
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
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

  const res = http.get(url);

  let body;
  try {
    body = res.json();
  } catch {
    body = null;
  }

  check(res, {
    'status is 200': (r) => r.status === 200,
    'route returns regionId': () =>
      body !== null && typeof body.regionId === 'string' && body.regionId.length > 0,
    'route returns responseGroup': () =>
      body !== null &&
      body.responseGroup !== undefined &&
      typeof body.responseGroup.id === 'string',
  });

  sleep(1);
}
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
