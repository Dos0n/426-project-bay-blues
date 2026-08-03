// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

export const options = {
  vus: 15,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

// AI: Sprint 3 hot spots model a Mullins Center event: most requests cluster
// on a handful of nearby locations so repeated lookups become cache hits,
// while a smaller share of dispersed campus locations stay cache misses.
const hotSpots = [
  { latitude: 42.3881, longitude: -72.5239, emergencyType: 'medical' },
  { latitude: 42.3881, longitude: -72.5239, emergencyType: 'criminal' },
  { latitude: 42.3868, longitude: -72.5301, emergencyType: 'medical' },
  { latitude: 42.3845, longitude: -72.5283, emergencyType: 'other' },
];

const dispersedLocations = [
  { latitude: 42.3912, longitude: -72.5267, emergencyType: 'fire' },
  { latitude: 42.3827, longitude: -72.5321, emergencyType: 'mental_health' },
  { latitude: 42.3863, longitude: -72.5354, emergencyType: 'medical' },
];

const jitter = () => (Math.random() - 0.5) * 0.002;

export default function () {
  // AI: ~80% of requests hit the shared hot spots (cache hits after warmup);
  // ~20% hit dispersed, slightly jittered coordinates (cache misses).
  const useHotSpot = Math.random() < 0.8;
  const pool = useHotSpot ? hotSpots : dispersedLocations;
  const location = pool[Math.floor(Math.random() * pool.length)];

  const latitude = useHotSpot
    ? location.latitude
    : location.latitude + jitter();
  const longitude = useHotSpot
    ? location.longitude
    : location.longitude + jitter();

  const url = `${BASE_URL}/route?latitude=${latitude}&longitude=${longitude}&emergencyType=${location.emergencyType}`;
  const res = http.get(url);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
// AI: End AI-assisted file. See AI-DISCLOSURE.md.
