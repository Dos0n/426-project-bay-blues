import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
// AI: Sprint 5 Prometheus instrumentation was added with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-10-161106-sprint-5-prometheus-final.jsonl.
import { createHttpMetrics } from "./http-metrics.js";
import { createLogger } from "./logger.js";

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

// AI: Sprint 4 Task 3 — validate the fault-injection mode against a fixed set at startup.
const readEnumValue = (name, defaultValue, allowedValues) => {
  const rawValue = process.env[name];

  if (rawValue === undefined) {
    return defaultValue;
  }

  if (!allowedValues.has(rawValue)) {
    throw new Error(`${name} must be one of: ${[...allowedValues].join(", ")}`);
  }

  return rawValue;
};

const app = express();
// AI: Sprint 5 routes lifecycle and error events through the structured JSON logger.
const log = createLogger("responder-dispatch-service");
const port = readBoundedInteger("PORT", 3000, 1, 65535);
const dispatchLatencyMs = readBoundedInteger(
  "DISPATCH_LATENCY_MS",
  200,
  0,
  10000,
);
// AI: Sprint 5 creates the dispatch-service metrics registry with AI assistance.
const { recordHttpMetrics, serveMetrics } = createHttpMetrics(
  "responder-dispatch-service",
);

// AI: Sprint 4 Task 3 — on-demand fault injection for the scripted failure scenario.
// faultMode is mutable so POST /admin/fault can toggle it at runtime without a restart.
const faultModes = new Set(["off", "error", "slow"]);
let faultMode = readEnumValue("DISPATCH_FAULT_MODE", "off", faultModes);
const faultLatencyMs = readBoundedInteger(
  "DISPATCH_FAULT_LATENCY_MS",
  6000,
  0,
  60000,
);

const logEvent = (level, fields) => {
  const entry = JSON.stringify({
    level,
    service: "responder-dispatch-service",
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  console.log(entry);
};

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
// AI: Sprint 5 request measurement and the Prometheus endpoint were added with AI assistance.
app.use(recordHttpMetrics);

app.use(express.json({ limit: "100kb" }));

app.get("/metrics", serveMetrics);

// AI: Sprint 4 Task 3 — health mirrors the injected fault so orchestration can see it.
// error -> 503 (Docker marks the container unhealthy); slow -> stays a fast 200
// ("healthy but slow"); off -> the original {status:"ok"} response unchanged.
app.get("/health", (_request, response) => {
  if (faultMode === "error") {
    response.status(503).json({
      status: "error",
      service: "responder-dispatch-service",
      faultMode,
    });
    return;
  }

  response.status(200).json({
    status: "ok",
    service: "responder-dispatch-service",
    ...(faultMode === "off" ? {} : { faultMode }),
  });
});

// AI: Sprint 4 Task 3 — admin toggle for the fault mode. Registered above the fault
// middleware so it stays reachable to turn the fault back off on demand.
app.get("/admin/fault", (_request, response) => {
  response.status(200).json({ faultMode, faultLatencyMs });
});

app.post("/admin/fault", (request, response) => {
  const body = request.body === undefined ? {} : request.body;
  const requestedMode = body.mode;

  if (!faultModes.has(requestedMode)) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: `mode must be one of: ${[...faultModes].join(", ")}`,
      },
    });
    return;
  }

  const previousMode = faultMode;
  faultMode = requestedMode;

  logEvent("warn", {
    event: "dispatch_fault_mode_changed",
    previousMode,
    faultMode,
  });

  response.status(200).json({ faultMode, previousMode, faultLatencyMs });
});

// AI: Sprint 4 Task 3 — inject the configured fault for the business endpoints only.
// error returns 503 immediately; slow adds faultLatencyMs on top of DISPATCH_LATENCY_MS.
app.use((request, response, next) => {
  if (faultMode === "off") {
    next();
    return;
  }

  if (faultMode === "error") {
    logEvent("warn", {
      event: "dispatch_fault_injected",
      faultMode,
      method: request.method,
      path: request.originalUrl,
    });

    response.status(503).json({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "responder-dispatch-service is in injected error fault mode",
      },
    });
    return;
  }

  logEvent("warn", {
    event: "dispatch_fault_injected",
    faultMode,
    method: request.method,
    path: request.originalUrl,
    extraLatencyMs: faultLatencyMs,
  });

  setTimeout(next, faultLatencyMs);
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

  // AI: Sprint 5 standardizes unexpected request failures as structured JSON.
  log("error", "Unhandled request error", {
    error: error instanceof Error ? error.message : String(error),
  });

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

app.listen(port, () => {
  // AI: Sprint 5 standardizes the service startup event as structured JSON.
  // AI: Sprint 4 Task 3 exposes the boot-time fault mode for observability.
  log("info", "Responder dispatch service started", { port, faultMode });
});
