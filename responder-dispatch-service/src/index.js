import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
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
const port = readBoundedInteger("PORT", 3000, 1, 65535);
const dispatchLatencyMs = readBoundedInteger(
  "DISPATCH_LATENCY_MS",
  200,
  0,
  10000,
);
const { recordHttpMetrics, serveMetrics } = createHttpMetrics(
  "responder-dispatch-service",
);

const statusOrder = ["assigned", "en_route", "on_scene", "resolved"];

const teamsUrl = new URL("../data/response-teams.json", import.meta.url);
const responseTeams = JSON.parse(readFileSync(teamsUrl, "utf8"));
const teamsById = new Map(responseTeams.map((team) => [team.teamId, team]));

const dispatches = new Map();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fieldAssurances = {
  isObject: (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
  isNonEmptyString: (value) =>
    typeof value === "string" && value.trim().length > 0,
  isUuid: (value) => typeof value === "string" && uuidPattern.test(value),
};

const validateDispatchRequest = (body) => {
  if (!fieldAssurances.isObject(body)) {
    return ["request body must be a JSON object"];
  }

  const errors = [];

  // Matches incident-service's crypto.randomUUID() incident IDs, so a
  // dispatch can never be created against an ID that could not be real.
  if (!fieldAssurances.isUuid(body.incidentId)) {
    errors.push("incidentId is required and must be a UUID");
  }

  if (!fieldAssurances.isNonEmptyString(body.teamId)) {
    errors.push("teamId is required and must be a non-empty string");
  } else if (!teamsById.has(body.teamId)) {
    errors.push(`teamId does not match a known response team: ${body.teamId}`);
  }

  return errors;
};

// Simulated dispatch-to-scene time, scaled by response team type.
const estimateEtaMinutes = (team) => {
  const baseMinutes = team.types.includes("fire") ? 6 : 4;
  const jitterMinutes = Math.floor(Math.random() * 5);
  return baseMinutes + jitterMinutes;
};

const createDispatch = (body, assignedAt) => {
  const team = teamsById.get(body.teamId);

  return {
    dispatchId: randomUUID(),
    incidentId: body.incidentId,
    team: { teamId: team.teamId, name: team.name, types: team.types },
    status: "assigned",
    etaMinutes: estimateEtaMinutes(team),
    assignedAt,
    updatedAt: assignedAt,
  };
};

const respondAfterLatency = (operation, next) => {
  setTimeout(() => {
    try {
      operation();
    } catch (error) {
      next(error);
    }
  }, dispatchLatencyMs);
};

app.disable("x-powered-by");
app.use(recordHttpMetrics);

app.use(express.json({ limit: "100kb" }));

app.get("/metrics", serveMetrics);

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "responder-dispatch-service",
  });
});

app.get("/teams", (_request, response) => {
  response.status(200).json({ teams: responseTeams });
});

app.post("/dispatches", (request, response, next) => {
  const assignedAt = new Date().toISOString();
  const body = request.body === undefined ? {} : request.body;
  const validationErrors = validateDispatchRequest(body);

  respondAfterLatency(() => {
    if (validationErrors.length > 0) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dispatch request is invalid",
          details: validationErrors,
        },
      });
      return;
    }

    const dispatch = createDispatch(body, assignedAt);
    dispatches.set(dispatch.dispatchId, dispatch);

    response
      .location(`/dispatches/${dispatch.dispatchId}`)
      .status(201)
      .json(dispatch);
  }, next);
});

app.get("/dispatches/:dispatchId", (request, response, next) => {
  respondAfterLatency(() => {
    const dispatch = dispatches.get(request.params.dispatchId);

    if (dispatch === undefined) {
      response.status(404).json({
        error: {
          code: "DISPATCH_NOT_FOUND",
          message: "No dispatch was found for the supplied dispatch ID",
        },
      });
      return;
    }

    response.status(200).json(dispatch);
  }, next);
});

app.patch("/dispatches/:dispatchId/status", (request, response, next) => {
  const body = request.body === undefined ? {} : request.body;
  const nextStatus = body.status;

  respondAfterLatency(() => {
    const dispatch = dispatches.get(request.params.dispatchId);

    if (dispatch === undefined) {
      response.status(404).json({
        error: {
          code: "DISPATCH_NOT_FOUND",
          message: "No dispatch was found for the supplied dispatch ID",
        },
      });
      return;
    }

    const currentIndex = statusOrder.indexOf(dispatch.status);
    const nextIndex = statusOrder.indexOf(nextStatus);

    if (nextIndex !== currentIndex + 1) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `status can only advance from "${dispatch.status}" to "${
            statusOrder[currentIndex + 1] ?? "(no further status)"
          }"`,
        },
      });
      return;
    }

    dispatch.status = nextStatus;
    dispatch.updatedAt = new Date().toISOString();

    response.status(200).json(dispatch);
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

  if (error?.type === "entity.parse.failed") {
    setTimeout(() => {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON",
        },
      });
    }, dispatchLatencyMs);
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
    }, dispatchLatencyMs);
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
      message: "Responder dispatch service started",
      port,
    }),
  );
});
