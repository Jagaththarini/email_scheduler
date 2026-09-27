
import "dotenv/config";
import IORedis from "ioredis";
import { Worker, Job } from "bullmq";
import nodemailer from "nodemailer";
import pool from "../db/pool.js";

const connection = new IORedis({
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD!,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  maxRetriesPerRequest: null,
});

connection.on("error", (err) => {
  console.error("Redis error:", err.message);
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

type EmailJob = {
  emailId: string;
  recipient: string;
  subject: string;
  body: string;
};

const concurrency = Math.max(
  1,
  Number(process.env.WORKER_CONCURRENCY || 5)
);

const hourlyLimit = Math.max(
  1,
  Number(process.env.EMAILS_PER_HOUR || 100)
);

const worker = new Worker<EmailJob>(
  "emails",
  async (job: Job<EmailJob>) => {
    const { emailId, recipient, subject, body } = job.data;

    if (!emailId) {
      throw new Error("Missing emailId in job data");
    }

    console.log(`Processing job ${job.id}: ${recipient}`);

    // Claim the email only if it is still scheduled.
    const claim = await pool.query(
      `UPDATE emails
       SET status = 'processing', error = NULL
       WHERE id = $1
         AND status = 'scheduled'
       RETURNING id`,
      [emailId]
    );

    // Don't send emails that were cancelled or already handled.
    if (claim.rowCount === 0) {
      console.log(`Skipping job ${job.id}: email is not scheduled`);
      return { skipped: true };
    }

    try {
      const info = await transporter.sendMail({
        from: `"ReachInbox Demo" <${process.env.SMTP_USER}>`,
        to: recipient,
        subject,
        text: body,
      });

      await pool.query(
        `UPDATE emails
         SET status = 'sent',
             sent_at = NOW(),
             error = NULL
         WHERE id = $1`,
        [emailId]
      );

      console.log("Email accepted by SMTP:", info.messageId);

      return {
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info),
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Email sending failed";

      const maxAttempts = job.opts.attempts || 1;
      const finalAttempt =
        job.attemptsMade + 1 >= maxAttempts;

      if (finalAttempt) {
        await pool.query(
          `UPDATE emails
           SET status = 'failed',
               error = $2
           WHERE id = $1
             AND status = 'processing'`,
          [emailId, message]
        );
      } else {
        await pool.query(
          `UPDATE emails
           SET status = 'scheduled',
               error = $2
           WHERE id = $1
             AND status = 'processing'`,
          [emailId, `Retry pending: ${message}`]
        );
      }

      throw err;
    }
  },
  {
    connection,
    concurrency,
    limiter: {
      max: hourlyLimit,
      duration: 60 * 60 * 1000,
    },
  }
);

worker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed`);

  if (result?.previewUrl) {
    console.log("Preview:", result.previewUrl);
  }

  if (result?.skipped) {
    console.log(`Job ${job.id} was skipped`);
  }
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

async function shutdown() {
  console.log("Closing email worker...");

  await worker.close();
  transporter.close();
  await connection.quit();
  await pool.end();

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);