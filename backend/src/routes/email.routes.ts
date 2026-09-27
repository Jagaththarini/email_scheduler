
import { Router } from "express";
import pool from "../db/pool.js";
import {
  scheduleEmails,
  cancelScheduledEmail,
} from "../services/email.service.js";

const router = Router();

// GET: Fetch emails with search, status filter, and pagination
router.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = String(req.query.search || "").trim();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(req.query.limit) || 10)
    );
    const offset = (page - 1) * limit;

    const allowedStatuses = [
      "scheduled",
      "processing",
      "sent",
      "failed",
    ];

    if (status && !allowedStatuses.includes(status)) {
      res.status(400).json({
        message: "Invalid status filter",
        allowedStatuses,
      });
      return;
    }

    const conditions = ["user_id = $1"];
    const values: (string | number)[] = ["demo-user"];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(
        `(recipient ILIKE $${values.length} OR subject ILIKE $${values.length})`
      );
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get total matching records
    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM emails
       ${whereClause}`,
      values
    );

    const total = Number(countResult.rows[0].count);

    // Get current page
    const dataValues = [...values, limit, offset];

    const result = await pool.query(
      `SELECT id, recipient, subject, body,
              scheduled_at, sent_at, status,
              error, created_at
       FROM emails
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    );

    res.status(200).json({
      count: result.rows.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      emails: result.rows,
    });
  } catch (error) {
    console.error("Get emails error:", error);

    res.status(500).json({
      message: "Failed to fetch emails",
    });
  }
});

// POST: Schedule emails
router.post("/schedule", async (req, res) => {
  try {
    const { recipients, subject, body, scheduledAt } =
      req.body ?? {};

    // Validate recipients
    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({
        message: "At least one recipient is required as an array",
      });
      return;
    }

    const validEmails = recipients.every(
      (email: unknown) =>
        typeof email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    );

    if (!validEmails) {
      res.status(400).json({
        message: "One or more recipient emails are invalid",
      });
      return;
    }

    // Validate subject and body
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof body !== "string" ||
      !body.trim()
    ) {
      res.status(400).json({
        message: "Subject and body are required",
      });
      return;
    }

    // Validate scheduledAt
    if (
      typeof scheduledAt !== "string" ||
      Number.isNaN(Date.parse(scheduledAt))
    ) {
      res.status(400).json({
        message: "scheduledAt must be a valid date string",
      });
      return;
    }

    if (Date.parse(scheduledAt) <= Date.now()) {
      res.status(400).json({
        message: "scheduledAt must be in the future",
      });
      return;
    }

    const emails = await scheduleEmails({
      userId: "demo-user",
      recipients: recipients.map((email: string) =>
        email.trim()
      ),
      subject: subject.trim(),
      body: body.trim(),
      scheduledAt,
    });

    res.status(201).json({
      message: "Emails scheduled successfully",
      count: emails.length,
      emails,
    });
  } catch (error) {
    console.error("Schedule route error:", error);

    res.status(500).json({
      message: "Failed to schedule emails",
      error:
        error instanceof Error
          ? error.message
          : "Unknown server error",
    });
  }
});

// DELETE: Cancel a scheduled email
router.delete("/:id", async (req, res) => {
  try {
    const result = await cancelScheduledEmail(req.params.id);

    if (!result.success) {
      res.status(409).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Cancel email error:", error);

    res.status(500).json({
      message: "Failed to cancel email",
    });
  }
});

export default router;