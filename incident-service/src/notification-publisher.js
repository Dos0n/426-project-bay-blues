// AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import { createLogger } from "./logger.js";

// AI: Sprint 5 preserves publisher event identifiers while adding required structured log fields.
const writeLog = createLogger("incident-service");
const logEvent = (level, event, message, fields = {}) => {
  writeLog(level, message, { event, ...fields });
};

const confirmPublish = (channel, queueName, job) =>
  new Promise((resolve, reject) => {
    try {
      channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(job)),
        {
          persistent: true,
          contentType: "application/json",
          contentEncoding: "utf-8",
          messageId: job.jobId,
          type: job.type,
          timestamp: Date.now(),
        },
        (error) => {
          if (error !== null && error !== undefined) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    } catch (error) {
      reject(error);
    }
  });

const createNotificationPublisher = async ({
  hostname,
  port,
  heartbeatSeconds,
  username,
  password,
  queueName,
}) => {
  const connection = await amqp.connect({
    protocol: "amqp",
    hostname,
    port,
    username,
    password,
    heartbeat: heartbeatSeconds,
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
  });

  const channel = await connection.createConfirmChannel();

  await channel.assertQueue(queueName, {
    durable: true,
  });

  logEvent(
    "info",
    "notification_publisher_ready",
    "Notification publisher ready",
    { queueName },
  );

  const publishIncidentNotification = async (incident) => {
    const job = {
      schemaVersion: 1,
      jobId: randomUUID(),
      type: "incident.notification.requested",
      incidentId: incident.incidentId,
      emergencyType: incident.emergencyType,
      severity: incident.severity,
      reportedAt: incident.reportedAt,
    };

    try {
      await confirmPublish(channel, queueName, job);
    } catch (error) {
      logEvent(
        "error",
        "incident_notification_enqueue_failed",
        "Incident notification enqueue failed",
        {
          jobId: job.jobId,
          incidentId: job.incidentId,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      throw error;
    }

    logEvent(
      "info",
      "incident_notification_enqueued",
      "Incident notification enqueued",
      { jobId: job.jobId, incidentId: job.incidentId, queueName },
    );

    return job;
  };

  return { publishIncidentNotification };
};

export { createNotificationPublisher };
// AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
