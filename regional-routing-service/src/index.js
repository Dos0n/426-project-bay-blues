// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
import { readFileSync } from "node:fs";
import express from "express";
import { createClient } from "redis";
import { createHttpMetrics } from "./http-metrics.js";

const readBoundedInteger = (name, defaultValue, minimum, maximum) => {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return defaultValue;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}`,
    );
  }

  return value;
};

const app = express();
const { recordHttpMetrics, serveMetrics } = createHttpMetrics(
  "regional-routing-service",
);
const port = readBoundedInteger("PORT", 3000, 1, 65535);
const routingLatencyMs = readBoundedInteger(
  "ROUTING_LATENCY_MS",
  200,
  0,
  10000,
);
// AI: Sprint 3 replica identity makes Caddy traffic distribution observable while preserving a useful local fallback.
const replicaId =
  process.env.REPLICA_ID ??
  process.env.HOSTNAME ??
  "regional-routing-local";
// AI: Austin's review fix bounds routing to the simulated local service area. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
const maximumRoutingDistanceMeters = 10000;

// AI: Sprint 3 Redis cache shared by every routing replica, keyed by rounded location so a real
// crowd clustered at one venue (e.g. a Mullins Center event) produces cache hits across replicas.
const redisUrl = process.env.REDIS_URL ?? "redis://redis:6379";
const routeCacheTtlSeconds = readBoundedInteger(
  "ROUTE_CACHE_TTL_SECONDS",
  30,
  1,
  3600,
);
// AI: Austin's review fix — 2 decimal places (~1km) merged distinct nearby
// venues (e.g. Central Transit and the Wellness Center) into the same cache
// key, so a cached Central Transit route was served for Wellness Center
// requests. 6 decimal places (~0.1m) still caches exact repeated lookups
// (the common case for a crowd at one venue) without merging real, distinct
// coordinates into the same key.
const cacheCoordinatePrecision = 6;

// AI: Austin's review fix — with the default offline queue, commands issued
// while Redis is unreachable hang until reconnection instead of rejecting,
// so the earlier try/catch fallback never actually ran; a request would just
// sit until the ambassador's own upstream timeout fired. Disabling the
// offline queue makes a command reject immediately when Redis is down, which
// the route handler below already treats as a cache miss.
const redisClient = createClient({ url: redisUrl, disableOfflineQueue: true });
redisClient.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Redis client error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
});

const buildRouteCacheKey = (latitude, longitude, emergencyType) =>
  `route:${latitude.toFixed(cacheCoordinatePrecision)}:${longitude.toFixed(
    cacheCoordinatePrecision,
  )}:${emergencyType}`;

const emergencyTypes = new Set([
  "medical",
  "fire",
  "criminal",
  "mental_health",
  "other",
  "unknown",
]);

const fixtureUrl = new URL("../data/regions.json", import.meta.url);
const regions = JSON.parse(readFileSync(fixtureUrl, "utf8"));

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversineDistanceMeters = (latitude, longitude, center) => {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = toRadians(center.latitude - latitude);
  const deltaLongitude = toRadians(center.longitude - longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitude)) *
      Math.cos(toRadians(center.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
};

const parseCoordinate = (rawValue, fieldName, minimum, maximum) => {
  // AI: Austin's review fix rejects blank query values before Number converts them to zero. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
  if (
    rawValue === undefined ||
    (typeof rawValue === "string" && rawValue.trim().length === 0)
  ) {
    return { error: `${fieldName} is required` };
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    return {
      error: `${fieldName} must be a number from ${minimum} through ${maximum}`,
    };
  }

  return { value };
};

const selectResponseGroup = (region, emergencyType) => {
  const matchedGroup = region.responseGroups.find((group) =>
    group.emergencyTypes.includes(emergencyType),
  );

  const selectedGroup = matchedGroup ?? region.responseGroups[0];

  return {
    id: selectedGroup.id,
    name: selectedGroup.name,
    types: selectedGroup.types,
  };
};

const findNearestRegion = (latitude, longitude) => {
  let nearestRegion = null;
  let nearestDistanceMeters = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    const distanceMeters = haversineDistanceMeters(
      latitude,
      longitude,
      region.center,
    );

    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters;
      nearestRegion = region;
    }
  }

  return { region: nearestRegion, distanceMeters: nearestDistanceMeters };
};

const respondAfterLatency = (operation, next) => {
  setTimeout(() => {
    try {
      operation();
    } catch (error) {
      next(error);
    }
  }, routingLatencyMs);
};

app.disable("x-powered-by");
app.use(recordHttpMetrics);

app.get("/metrics", serveMetrics);

// AI: Sprint 3 success responses expose the serving replica without changing existing response fields or routing behavior.
app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "regional-routing-service",
    servedBy: replicaId,
  });
});

app.get("/regions", (_request, response, next) => {
  respondAfterLatency(() => {
    response.status(200).json({
      servedBy: replicaId,
      regions: regions.map((region) => ({
        regionId: region.regionId,
        regionName: region.regionName,
        center: region.center,
        venues: region.venues,
        responseGroups: region.responseGroups.map((group) => ({
          id: group.id,
          name: group.name,
          types: group.types,
          emergencyTypes: group.emergencyTypes,
        })),
      })),
    });
  }, next);
});

app.get("/route", async (request, response, next) => {
  const latitudeResult = parseCoordinate(
    request.query.latitude,
    "latitude",
    -90,
    90,
  );
  const longitudeResult = parseCoordinate(
    request.query.longitude,
    "longitude",
    -180,
    180,
  );
  const rawEmergencyType = request.query.emergencyType;
  const emergencyType =
    rawEmergencyType === undefined ? "unknown" : String(rawEmergencyType);

  const validationErrors = [];

  if (latitudeResult.error !== undefined) {
    validationErrors.push(latitudeResult.error);
  }

  if (longitudeResult.error !== undefined) {
    validationErrors.push(longitudeResult.error);
  }

  if (!emergencyTypes.has(emergencyType)) {
    validationErrors.push("emergencyType is not a supported value");
  }

  if (validationErrors.length > 0) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Route request is invalid",
        details: validationErrors,
      },
    });
    return;
  }

  const cacheKey = buildRouteCacheKey(
    latitudeResult.value,
    longitudeResult.value,
    emergencyType,
  );

  const buildRouteResult = () => {
    const { region, distanceMeters } = findNearestRegion(
      latitudeResult.value,
      longitudeResult.value,
    );

    if (region === null || distanceMeters > maximumRoutingDistanceMeters) {
      return { notFound: true };
    }

    return {
      notFound: false,
      body: {
        regionId: region.regionId,
        regionName: region.regionName,
        location: {
          latitude: latitudeResult.value,
          longitude: longitudeResult.value,
        },
        emergencyType,
        responseGroup: selectResponseGroup(region, emergencyType),
        matchedBy: "coordinates",
        distanceMeters: Math.round(distanceMeters),
      },
    };
  };

  const logCacheEvent = (cacheStatus) => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Route cache lookup",
        servedBy: replicaId,
        cacheKey,
        cacheStatus,
      }),
    );
  };

  // AI: Sprint 3 cache hits skip respondAfterLatency entirely so the endpoint demonstrably
  // answers faster on a repeated location than it does on first access.
  // AI: Austin's review fix — a Redis outage previously bubbled up to `next`
  // and returned a 500/504, even though the replica can still compute the
  // route itself. A failed cache read is now treated as a cache miss instead.
  let cachedValue = null;

  try {
    cachedValue = await redisClient.get(cacheKey);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Redis cache read failed; falling back to direct route calculation",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  if (cachedValue !== null) {
    logCacheEvent("HIT");
    const cachedBody = JSON.parse(cachedValue);
    response.status(200).json({
      servedBy: replicaId,
      ...cachedBody,
      routedAt: new Date().toISOString(),
      cache: "HIT",
    });
    return;
  }

  logCacheEvent("MISS");

  respondAfterLatency(() => {
    const result = buildRouteResult();

    if (result.notFound) {
      response.status(404).json({
        error: {
          code: "REGION_NOT_FOUND",
          message: "No region could be matched for the supplied coordinates",
        },
      });
      return;
    }

    redisClient
      .set(cacheKey, JSON.stringify(result.body), {
        EX: routeCacheTtlSeconds,
      })
      .catch((error) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to store route result in cache",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });

    response.status(200).json({
      servedBy: replicaId,
      ...result.body,
      routedAt: new Date().toISOString(),
      cache: "MISS",
    });
  }, next);
});

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "No route was found for the supplied method and path",
    },
  });
});

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled request error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

// AI: Sprint 3 startup logging identifies each independently running routing replica.
await redisClient.connect();

app.listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      service: "regional-routing-service",
      message: "Regional routing service started",
      port,
      replicaId,
      redisUrl,
    }),
  );
});
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
