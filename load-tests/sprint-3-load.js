import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

// Known-good UMass coordinates from docs/SERVICES.md smoke checks.
const ROUTE_PATH =
  '/route?latitude=42.3868&longitude=-72.5301&emergencyType=medical';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get(`${BASE_URL}${ROUTE_PATH}`);

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
