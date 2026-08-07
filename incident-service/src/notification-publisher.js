// AI: This RabbitMQ notification publisher was generated with AI assistance.
import { randomUUID } from "node:crypto";
import amqp from "amqplib";

const log = (level, event, fields = {}) => {
  const entry = JSON.stringify({
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  console.log(entry);
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
    log("error", "rabbitmq_connection_error", {
      service: "incident-service",
      error: error instanceof Error ? error.message : String(error),
    });
  });

  connection.on("close", () => {
    log("error", "rabbitmq_connection_closed", {
      service: "incident-service",
    });
  });

  const channel = await connection.createConfirmChannel();

  await channel.assertQueue(queueName, {
    durable: true,
  });

  log("info", "notification_publisher_ready", {
    queueName,
  });

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
      log("error", "incident_notification_enqueue_failed", {
        jobId: job.jobId,
        incidentId: job.incidentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }

    log("info", "incident_notification_enqueued", {
      jobId: job.jobId,
      incidentId: job.incidentId,
      queueName,
    });

    return job;
  };

  return { publishIncidentNotification };
};

export { createNotificationPublisher };
// AI: End AI-assisted notification publisher.
