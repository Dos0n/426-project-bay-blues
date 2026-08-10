import { Counter, Histogram, Registry } from "prom-client";

const responseTimeBucketsMilliseconds = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

const createHttpMetrics = (serviceName) => {
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
