// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
import { readFileSync } from "node:fs";
import express from "express";

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
const port = readBoundedInteger("PORT", 3000, 1, 65535);
const routingLatencyMs = readBoundedInteger(
  "ROUTING_LATENCY_MS",
  200,
  0,
  10000,
);

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
  if (rawValue === undefined) {
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

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "regional-routing-service",
  });
});

app.get("/regions", (_request, response, next) => {
  respondAfterLatency(() => {
    response.status(200).json({
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

app.get("/route", (request, response, next) => {
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

  respondAfterLatency(() => {
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

    const { region, distanceMeters } = findNearestRegion(
      latitudeResult.value,
      longitudeResult.value,
    );

    if (region === null) {
      response.status(404).json({
        error: {
          code: "REGION_NOT_FOUND",
          message: "No region could be matched for the supplied coordinates",
        },
      });
      return;
    }

    response.status(200).json({
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
      routedAt: new Date().toISOString(),
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

app.listen(port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Regional routing service started",
      port,
    }),
  );
});
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/sradhakrishnan/.
