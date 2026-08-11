// AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
import os from "node:os";
import amqp from "amqplib";
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

const readEnvironmentValue = (name, defaultValue) => {
  const value = process.env[name] ?? defaultValue;

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
};

const port = readBoundedInteger("PORT", 3000, 1, 65535);
const rabbitMqPort = readBoundedInteger("RABBITMQ_PORT", 5672, 1, 65535);
const rabbitMqHeartbeatSeconds = readBoundedInteger(
  "RABBITMQ_HEARTBEAT_SECONDS",
  60,
  5,
  300,
);
const processingDelayMs = readBoundedInteger(
  "NOTIFICATION_PROCESSING_MS",
  500,
  0,
  30000,
);

const rabbitMqHost = readEnvironmentValue("RABBITMQ_HOST", "rabbitmq");
const rabbitMqUser = readEnvironmentValue("RABBITMQ_USER");
const rabbitMqPassword = readEnvironmentValue("RABBITMQ_PASSWORD");
const queueName = readEnvironmentValue(
  "NOTIFICATION_QUEUE",
  "incident-notification-jobs",
);
const workerId = os.hostname();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isNotificationJob = (job) =>
  job !== null &&
  typeof job === "object" &&
  !Array.isArray(job) &&
  job.schemaVersion === 1 &&
  job.type === "incident.notification.requested" &&
  typeof job.jobId === "string" &&
  uuidPattern.test(job.jobId) &&
  typeof job.incidentId === "string" &&
  uuidPattern.test(job.incidentId) &&
  isNonEmptyString(job.emergencyType) &&
  isNonEmptyString(job.severity) &&
  isNonEmptyString(job.reportedAt) &&
  !Number.isNaN(Date.parse(job.reportedAt));

const delay = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

// AI: Sprint 5 preserves queue event identifiers while adding required structured log fields.
const writeLog = createLogger("emergency-notification-worker");
const logEvent = (level, event, message, fields = {}) => {
  writeLog(level, message, { event, workerId, ...fields });
};

const app = express();
app.disable("x-powered-by");

// AI: Sprint 5 creates a service-local registry, measures requests, and exposes /metrics with AI assistance.
const { recordHttpMetrics, serveMetrics } = createHttpMetrics(
  "emergency-notification-worker",
);
app.use(recordHttpMetrics);

app.get("/metrics", serveMetrics);

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "No route was found for the supplied method and path",
    },
  });
});

const start = async () => {
  const connection = await amqp.connect({
    protocol: "amqp",
    hostname: rabbitMqHost,
    port: rabbitMqPort,
    username: rabbitMqUser,
    password: rabbitMqPassword,
    heartbeat: rabbitMqHeartbeatSeconds,
  });

  connection.on("error", (error) => {
    logEvent(
      "error",
      "rabbitmq_connection_error",
      "RabbitMQ connection error",
      { error: error instanceof Error ? error.message : String(error) },
    );
  });

  connection.on("close", () => {
    logEvent(
      "error",
      "rabbitmq_connection_closed",
      "RabbitMQ connection closed",
    );
    process.exit(1);
  });

  const channel = await connection.createChannel();

  await channel.assertQueue(queueName, {
    durable: true,
  });

  await channel.prefetch(1);

  await channel.consume(
    queueName,
    async (message) => {
      if (message === null) {
        return;
      }

      let job;

      try {
        job = JSON.parse(message.content.toString("utf8"));
      } catch {
        logEvent(
          "error",
          "incident_notification_rejected",
          "Incident notification rejected",
          { reason: "invalid_json" },
        );
        channel.nack(message, false, false);
        return;
      }

      if (!isNotificationJob(job)) {
        logEvent(
          "error",
          "incident_notification_rejected",
          "Incident notification rejected",
          { reason: "invalid_schema" },
        );
        channel.nack(message, false, false);
        return;
      }

      try {
        logEvent(
          "info",
          "incident_notification_received",
          "Incident notification received",
          {
            jobId: job.jobId,
            incidentId: job.incidentId,
            redelivered: message.fields.redelivered,
          },
        );

        await delay(processingDelayMs);

        logEvent(
          "info",
          "incident_notification_completed",
          "Incident notification completed",
          {
            jobId: job.jobId,
            incidentId: job.incidentId,
            emergencyType: job.emergencyType,
            severity: job.severity,
          },
        );

        channel.ack(message);
      } catch (error) {
        logEvent(
          "error",
          "incident_notification_failed",
          "Incident notification failed",
          {
            jobId: job.jobId,
            incidentId: job.incidentId,
            error: error instanceof Error ? error.message : String(error),
          },
        );

        channel.nack(message, false, true);
      }
    },
    { noAck: false },
  );

  app.listen(port, () => {
    logEvent(
      "info",
      "notification_worker_ready",
      "Notification worker ready",
      { port, queueName },
    );
  });
};

start().catch((error) => {
  logEvent(
    "error",
    "notification_worker_start_failed",
    "Notification worker failed to start",
    { error: error instanceof Error ? error.message : String(error) },
  );
  process.exit(1);
});

// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
