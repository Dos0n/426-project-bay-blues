// AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/dos0n-sprint2/.
import express from "express";
// AI: Sprint 5 Prometheus instrumentation was added with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-10-155325-sprint-5-prometheus.jsonl.
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
const upstreamUrl = (
  process.env.UPSTREAM_URL ?? "http://incident-service:3000"
).replace(/\/$/, "");
const upstreamTimeoutMs = readBoundedInteger(
  "UPSTREAM_TIMEOUT_MS",
  2000,
  50,
  60000,
);
const maxRetries = readBoundedInteger("MAX_RETRIES", 2, 0, 5);
// Simulated ambassador-side overhead (request logging and inspection) applied
// to every proxied response, independent of upstream latency.
const processingDelayMs = readBoundedInteger(
  "AMBASSADOR_PROCESSING_DELAY_MS",
  50,
  0,
  5000,
);
// AI: Sprint 5 creates the ambassador metrics registry with AI assistance.
const { recordHttpMetrics, serveMetrics } = createHttpMetrics(
  "incident-ambassador",
);

// Only GET/HEAD are safe to retry; a retried POST could create a duplicate incident.
const idempotentMethods = new Set(["GET", "HEAD"]);

// AI: Sprint 5 normalizes incident IDs so each UUID does not create a separate Prometheus time series.
const getProxyMetricsRoute = (path) => {
  if (path === "/incidents") {
    return "/incidents";
  }

  if (/^\/incidents\/[^/]+$/.test(path)) {
    return "/incidents/:incidentId";
  }

  return "unmatched";
};

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const logProxyEvent = (fields) => {
  console.log(
    JSON.stringify({
      level: "info",
      service: "incident-ambassador",
      ...fields,
    }),
  );
};

const proxyRequest = async (request, response, requestBody) => {
  // Collapse leading slashes so a path like "//other-host/health" cannot be
  // parsed as protocol-relative and redirect the proxy to a different host.
  const sanitizedPath = `/${request.originalUrl.replace(/^\/+/, "")}`;
  const targetUrl = new URL(sanitizedPath, `${upstreamUrl}/`);
  const isIdempotent = idempotentMethods.has(request.method);
  const maximumAttempts = isIdempotent ? maxRetries + 1 : 1;
  let lastErrorMessage = "Upstream request failed";
  let lastStatusCode = 502;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, upstreamTimeoutMs);

    try {
      const upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          accept: request.get("accept") ?? "application/json",
          ...(requestBody.length > 0
            ? { "content-type": request.get("content-type") ?? "application/json" }
            : {}),
        },
        body: requestBody.length > 0 ? requestBody : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - attemptStartedAt;
      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      const contentType = upstreamResponse.headers.get("content-type");

      logProxyEvent({
        message: "Proxied upstream request",
        method: request.method,
        path: request.originalUrl,
        attempt,
        upstreamStatus: upstreamResponse.status,
        durationMs,
      });

      if (
        upstreamResponse.status >= 500 &&
        isIdempotent &&
        attempt < maximumAttempts
      ) {
        lastStatusCode = upstreamResponse.status;
        lastErrorMessage = `Upstream returned ${upstreamResponse.status}`;
        await sleep(50 * attempt);
        continue;
      }

      if (contentType) {
        response.set("content-type", contentType);
      }

      // Hold the response for the simulated inspection/logging delay before replying.
      await sleep(processingDelayMs);
      response.status(upstreamResponse.status).send(responseBody);
      return;
    } catch (error) {
      const durationMs = Date.now() - attemptStartedAt;
      const timedOut = error?.name === "AbortError";
      lastErrorMessage = timedOut
        ? "Upstream request timed out"
        : error instanceof Error
          ? error.message
          : String(error);
      lastStatusCode = timedOut ? 504 : 502;

      logProxyEvent({
        message: timedOut
          ? "Upstream request timed out"
          : "Upstream request failed",
        method: request.method,
        path: request.originalUrl,
        attempt,
        upstreamStatus: null,
        durationMs,
        error: lastErrorMessage,
      });

      if (isIdempotent && attempt < maximumAttempts) {
        await sleep(50 * attempt);
        continue;
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  response.status(lastStatusCode).json({
    error: {
      code: lastStatusCode === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      message: lastErrorMessage,
    },
  });
};

app.disable("x-powered-by");
// AI: Sprint 5 request measurement and the Prometheus endpoint were added with AI assistance.
app.use(recordHttpMetrics);

app.get("/metrics", serveMetrics);

// Buffer the raw body so it can be forwarded byte-for-byte without re-serializing JSON.
app.use(express.raw({ type: "*/*", limit: "100kb" }));

app.get("/health", async (_request, response) => {
  try {
    const upstreamHealth = await fetch(`${upstreamUrl}/health`, {
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });

    if (!upstreamHealth.ok) {
      response.status(503).json({
        status: "degraded",
        service: "incident-ambassador",
        upstream: "unavailable",
      });
      return;
    }

    response.status(200).json({
      status: "ok",
      service: "incident-ambassador",
      upstream: "incident-service",
    });
  } catch {
    response.status(503).json({
      status: "degraded",
      service: "incident-ambassador",
      upstream: "unavailable",
    });
  }
});

app.use((request, response, next) => {
  const allowedMethods = new Set(["GET", "HEAD", "POST"]);

  // AI: Sprint 5 assigns the bounded route label before catch-all proxy handling.
  response.locals.metricsRoute = getProxyMetricsRoute(request.path);

  if (!allowedMethods.has(request.method)) {
    response.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Ambassador only proxies GET, HEAD, and POST requests",
      },
    });
    return;
  }

  const requestBody = Buffer.isBuffer(request.body)
    ? request.body
    : Buffer.alloc(0);

  proxyRequest(request, response, requestBody).catch(next);
});

app.use((error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      service: "incident-ambassador",
      message: "Unhandled ambassador error",
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
      message: "Incident ambassador started",
      port,
      upstreamUrl,
      upstreamTimeoutMs,
      maxRetries,
    }),
  );
});
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/dos0n-sprint2/.
