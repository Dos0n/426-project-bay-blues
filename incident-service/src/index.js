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
  "criminal",
  "mental_health",
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
const incidents = new Map(
  fixtureIncidents.map((incident) => [incident.incidentId, incident]),
);

// AI: Review-driven field assurances centralize reusable request validation while treating fixtures as trusted input.
const utcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const fieldAssurances = {
  isObject: (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
  isNonEmptyString: (value) =>
    typeof value === "string" && value.trim().length > 0,
  isTimestamp: (value) => {
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
  },
  optionalEnum: (fieldName, value, allowedValues) => {
    if (value === undefined || allowedValues.has(value)) {
      return [];
    }

    return [`${fieldName} is not a supported value`];
  },
  optionalString: (fieldName, value, maximumLength) => {
    if (value === undefined) {
      return [];
    }

    if (!fieldAssurances.isNonEmptyString(value)) {
      return [`${fieldName} must be a non-empty string`];
    }

    if (value.trim().length > maximumLength) {
      return [`${fieldName} must not exceed ${maximumLength} characters`];
    }

    return [];
  },
  requiredNumber: (fieldName, value, minimum, maximum) => {
    if (value === undefined) {
      return [`${fieldName} is required`];
    }

    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      return [
        `${fieldName} must be a number from ${minimum} through ${maximum}`,
      ];
    }

    return [];
  },
  optionalNonNegativeNumber: (fieldName, value) => {
    if (value === undefined) {
      return [];
    }

    if (!Number.isFinite(value) || value < 0) {
      return [`${fieldName} must be a non-negative number`];
    }

    return [];
  },
  optionalTimestamp: (fieldName, value) => {
    if (value === undefined || fieldAssurances.isTimestamp(value)) {
      return [];
    }

    return [`${fieldName} must be a valid timestamp`];
  },
};

const assureLocation = (location) => {
  if (location === undefined) {
    return ["location is required"];
  }

  if (!fieldAssurances.isObject(location)) {
    return ["location must be a JSON object"];
  }

  return [
    ...fieldAssurances.requiredNumber(
      "location.latitude",
      location.latitude,
      -90,
      90,
    ),
    ...fieldAssurances.requiredNumber(
      "location.longitude",
      location.longitude,
      -180,
      180,
    ),
    // Venue is optional; when present, it must be a bounded non-empty string.
    ...fieldAssurances.optionalString(
      "location.venue",
      location.venue,
      maximumVenueLength,
    ),
    ...fieldAssurances.optionalNonNegativeNumber(
      "location.accuracyMeters",
      location.accuracyMeters,
    ),
    ...fieldAssurances.optionalTimestamp(
      "location.capturedAt",
      location.capturedAt,
    ),
  ];
};

const incidentFieldAssurances = {
  emergencyType: (body) =>
    fieldAssurances.optionalEnum(
      "emergencyType",
      body.emergencyType,
      emergencyTypes,
    ),
  severity: (body) =>
    fieldAssurances.optionalEnum("severity", body.severity, severities),
  description: (body) =>
    fieldAssurances.optionalString(
      "description",
      body.description,
      maximumDescriptionLength,
    ),
  location: (body) => assureLocation(body.location),
};

const validateIncidentRequest = (body) => {
  if (!fieldAssurances.isObject(body)) {
    return ["request body must be a JSON object"];
  }

  return Object.values(incidentFieldAssurances).flatMap((assureField) =>
    assureField(body),
  );
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
// Parse JSON and enforce the request-size limit before any route handles input.
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
// This catch-all middleware runs after the routes and maps every unmatched path to JSON.
app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "No route was found for the supplied method and path",
    },
  });
});

// Express recognizes this four-argument middleware as the final error handler for parser and route failures.
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
