// AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-10-161106-sprint-5-prometheus-final.jsonl.
import { Counter, Histogram, Registry } from "prom-client";

const responseTimeBucketsMilliseconds = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

const createHttpMetrics = (serviceName, log) => {
  const register = new Registry();

  const requestsReceived = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests received",
    labelNames: ["service", "method", "route", "status_code"],
    registers: [register],
  });

  const responseTimeMilliseconds = new Histogram({
    name: "http_request_duration_milliseconds",
    help: "HTTP response time in milliseconds",
    labelNames: ["service", "method", "route", "status_code"],
    buckets: responseTimeBucketsMilliseconds,
    registers: [register],
  });

  const recordHttpMetrics = (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.once("finish", () => {
      const elapsedMilliseconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const labels = {
        service: serviceName,
        method: request.method,
        route:
          response.locals.metricsRoute ?? request.route?.path ?? "unmatched",
        status_code: String(response.statusCode),
      };

      requestsReceived.inc(labels);
      responseTimeMilliseconds.observe(labels, elapsedMilliseconds);

      // AI: Sprint 5 reuses the metrics timer to emit one structured completion log per HTTP response.
      const statusCode = response.statusCode;
      const level =
        statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      log(level, "HTTP request completed", {
        method: request.method,
        path: request.path,
        statusCode,
        responseTimeMs: Number(elapsedMilliseconds.toFixed(3)),
      });
    });

    next();
  };

  const serveMetrics = async (_request, response, next) => {
    try {
      response.type(register.contentType).send(await register.metrics());
    } catch (error) {
      next(error);
    }
  };

  return { recordHttpMetrics, serveMetrics };
};

export { createHttpMetrics };
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-10-161106-sprint-5-prometheus-final.jsonl.
