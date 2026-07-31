// Sprint 3 k6 load test skeleton.
// Target: replicated service behind Caddy (Sprint 3 serving pattern).
// Fill in the scenario once the load-balanced endpoint URL/path is known.
//
// Run (after options are finalized):
//   k6 run load-tests/sprint-3-load.js
//   BASE_URL=http://localhost:8080 k6 run load-tests/sprint-3-load.js

import http from 'k6/http';
import { check, sleep } from 'k6';

// BASE_URL should point at Caddy once replicas are live.
// Until then, override with an existing host port for dry runs.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// Placeholder options — commit 2 will set >=10 VUs and >=30s duration.
export const options = {
  vus: 1,
  duration: '1s',
  // thresholds: { ... } // aligned with docs/SLO.md in a later commit
};

export default function () {
  // TODO: exercise the replicated service path behind Caddy.
  // Example once the team picks routing as the LB target:
  //   const res = http.get(`${BASE_URL}/route?latitude=42.39&longitude=-72.53`);
  const res = http.get(`${BASE_URL}/health`);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
