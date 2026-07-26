// AI: This file was generated or substantially modified with AI assistance. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";

// AI: Bounded environment parsing and input-size constants were generated with AI assistance.
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
const incidentLatencyMs = readBoundedInteger(
  "INCIDENT_LATENCY_MS",
  200,
  0,
  10000,
);

const maximumDescriptionLength = 1000;
const maximumVenueLength = 200;

const emergencyTypes = new Set([
  "medical",
  "fire",
  "security",
  "crisis",
  "other",
  "unknown",
]);

const severities = new Set([
  "low",
  "medium",
  "high",
  "critical",
  "unassessed",
]);

// AI: The read-only JSON fixtures seed runtime-only state shared by POST and GET.
const fixtureUrl = new URL("../data/incidents.json", import.meta.url);
const fixtureIncidents = JSON.parse(readFileSync(fixtureUrl, "utf8"));

if (!Array.isArray(fixtureIncidents)) {
  throw new Error("Incident fixture must contain a JSON array");
}

const incidents = new Map(
  fixtureIncidents.map((incident) => [incident.incidentId, incident]),
);

if (incidents.size !== fixtureIncidents.length) {
  throw new Error("Fixture incident IDs must be unique");
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

// AI: Strict UTC timestamp and incident-request validation were generated with AI assistance.
const utcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const isTimestamp = (value) => {
  if (typeof value !== "string" || !utcTimestampPattern.test(value)) {
    return false;
  }

  const parsedTimestamp = new Date(value);

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return false;
  }

  const normalizedValue = value.includes(".")
    ? value
    : value.replace("Z", ".000Z");

  return parsedTimestamp.toISOString() === normalizedValue;
};

const validateIncidentRequest = (body) => {
  if (!isObject(body)) {
    return ["request body must be a JSON object"];
  }

  const errors = [];

  if (
    body.emergencyType !== undefined &&
    !emergencyTypes.has(body.emergencyType)
  ) {
    errors.push("emergencyType is not a supported value");
  }

  if (body.severity !== undefined && !severities.has(body.severity)) {
    errors.push("severity is not a supported value");
  }

  if (
    body.description !== undefined &&
    !isNonEmptyString(body.description)
  ) {
    errors.push("description must be a non-empty string");
  } else if (body.description?.trim().length > maximumDescriptionLength) {
    errors.push(
      `description must not exceed ${maximumDescriptionLength} characters`,
    );
  }

  if (body.location === undefined) {
    errors.push("location is required");
    return errors;
  }

  if (!isObject(body.location)) {
    errors.push("location must be a JSON object");
    return errors;
  }

  const location = body.location;

  if (location.latitude === undefined) {
    errors.push("location.latitude is required");
  } else if (
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    errors.push("location.latitude must be a number from -90 through 90");
  }

  if (location.longitude === undefined) {
    errors.push("location.longitude is required");
  } else if (
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    errors.push("location.longitude must be a number from -180 through 180");
  }

  if (
    location.venue !== undefined &&
    !isNonEmptyString(location.venue)
  ) {
    errors.push("location.venue must be a non-empty string");
  } else if (location.venue?.trim().length > maximumVenueLength) {
    errors.push(
      `location.venue must not exceed ${maximumVenueLength} characters`,
    );
  }

  if (
    location.accuracyMeters !== undefined &&
    (!Number.isFinite(location.accuracyMeters) ||
      location.accuracyMeters < 0)
  ) {
    errors.push("location.accuracyMeters must be a non-negative number");
  }

  if (
    location.capturedAt !== undefined &&
    !isTimestamp(location.capturedAt)
  ) {
    errors.push("location.capturedAt must be a valid timestamp");
  }

  return errors;
};

const normalizeLocation = (location) => {
  const allowedFields = [
    "latitude",
    "longitude",
    "venue",
    "accuracyMeters",
    "capturedAt",
  ];

  return Object.fromEntries(
    allowedFields
      .filter((field) => location[field] !== undefined)
      .map((field) => [
        field,
        typeof location[field] === "string"
          ? location[field].trim()
          : location[field],
      ]),
  );
};

// AI: Incident construction assigns server-owned fields while preserving allowed caller input.
const createIncident = (body, reportedAt) => {
  return {
    incidentId: randomUUID(),
    emergencyType: body.emergencyType ?? "unknown",
    severity: body.severity ?? "unassessed",
    status: "reported",
    location: normalizeLocation(body.location),
    ...(body.description === undefined
      ? {}
      : { description: body.description.trim() }),
    reportedAt,
    updatedAt: reportedAt,
    version: 1,
  };
};

const respondAfterLatency = (operation, next) => {
  setTimeout(() => {
    try {
      operation();
    } catch (error) {
      next(error);
    }
  }, incidentLatencyMs);
};

// AI: Express middleware and the health, create, and lookup endpoints were generated with AI assistance.
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "incident-service",
  });
});

app.post("/incidents", (request, response, next) => {
  const reportedAt = new Date().toISOString();
  const body = request.body === undefined ? {} : request.body;
  const validationErrors = validateIncidentRequest(body);

  respondAfterLatency(() => {
    if (validationErrors.length > 0) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Incident request is invalid",
          details: validationErrors,
        },
      });
      return;
    }

    const incident = createIncident(body, reportedAt);
    incidents.set(incident.incidentId, incident);

    response
      .location(`/incidents/${incident.incidentId}`)
      .status(201)
      .json(incident);
  }, next);
});

app.get("/incidents/:incidentId", (request, response, next) => {
  respondAfterLatency(() => {
    const incident = incidents.get(request.params.incidentId);

    if (incident === undefined) {
      response.status(404).json({
        error: {
          code: "INCIDENT_NOT_FOUND",
          message: "No incident was found for the supplied incident ID",
        },
      });
      return;
    }

    response.status(200).json(incident);
  }, next);
});

// AI: Structured JSON handlers cover unknown routes, parser errors, payload limits, and unexpected failures.
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

  if (error?.type === "entity.parse.failed") {
    setTimeout(() => {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON",
        },
      });
    }, incidentLatencyMs);
    return;
  }

  if (error?.type === "entity.too.large") {
    setTimeout(() => {
      response.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds the 100 KB limit",
        },
      });
    }, incidentLatencyMs);
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
      message: "Incident service started",
      port,
    }),
  );
});
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
