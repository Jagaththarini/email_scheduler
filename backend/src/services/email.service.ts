
import { randomUUID } from "node:crypto";
import pool from "../db/pool.js";
import { emailQueue } from "../queues/email.queue.js";

type ScheduleEmailInput = {
  userId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string;
};

const MIN_EMAIL_DELAY_MS = Math.max(
  0,
  Number(process.env.MIN_EMAIL_DELAY_MS || 1000)
);

export async function scheduleEmails(input: ScheduleEmailInput) {
  const { userId, recipients, subject, body, scheduledAt } = input;

  const scheduledTime = new Date(scheduledAt);

  if (Number.isNaN(scheduledTime.getTime())) {
    throw new Error("Invalid scheduled date");
  }

  if (scheduledTime.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future");
  }

  if (!recipients?.length) {
    throw new Error("At least one recipient is required");
  }

  if (!subject?.trim() || !body?.trim()) {
    throw new Error("Subject and body are required");
  }

  const cleanRecipients = recipients
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (!cleanRecipients.length) {
    throw new Error("At least one valid recipient is required");
  }

  const scheduledEmails = [];

  for (const [index, recipient] of cleanRecipients.entries()) {
    const emailId = randomUUID();

    // Space recipients in this batch by the configured minimum delay.
    const individualScheduledTime = new Date(
      scheduledTime.getTime() + index * MIN_EMAIL_DELAY_MS
    );

    const result = await pool.query(
      `INSERT INTO emails
       (id, user_id, recipient, subject, body, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
       RETURNING *`,
      [
        emailId,
        userId,
        recipient,
        subject.trim(),
        body,
        individualScheduledTime,
      ]
    );

    const email = result.rows[0];

    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
      },
      {
        jobId: email.id,
        delay: Math.max(
          0,
          individualScheduledTime.getTime() - Date.now()
        ),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    scheduledEmails.push(email);
  }

  return scheduledEmails;
}

export async function cancelScheduledEmail(emailId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, status
       FROM emails
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [emailId, "demo-user"]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, message: "Email not found" };
    }

    if (result.rows[0].status !== "scheduled") {
      await client.query("ROLLBACK");
      return {
        success: false,
        message: "Only scheduled emails can be cancelled",
      };
    }

    const job = await emailQueue.getJob(emailId);

    if (job) {
      const removed = await job.remove().then(
        () => true,
        () => false
      );

      if (!removed) {
        await client.query("ROLLBACK");
        return {
          success: false,
          message: "Email is already being processed",
        };
      }
    }

    await client.query(
      `UPDATE emails
       SET status = 'failed', error = 'Cancelled by user'
       WHERE id = $1`,
      [emailId]
    );

    await client.query("COMMIT");

    return { success: true, message: "Email cancelled" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}