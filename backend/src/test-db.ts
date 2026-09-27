import pool from "./db/pool.js";
import { randomUUID } from "node:crypto";

async function main() {
  try {
    // 1. Test PostgreSQL connection
    const result = await pool.query("SELECT NOW()");
    console.log("PostgreSQL connected!");
    console.log("Time:", result.rows[0].now);

    // 2. Insert a test email record
    const emailId = randomUUID();

    const inserted = await pool.query(
      `INSERT INTO emails
       (id, user_id, recipient, subject, body, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        emailId,
        "demo-user",
        "test@example.com",
        "PostgreSQL test",
        "This is a test email record.",
        new Date(Date.now() + 60 * 60 * 1000),
      ]
    );

    console.log("Email record inserted!");
    console.log(inserted.rows[0]);

    // 3. Read the record back
    const saved = await pool.query(
      "SELECT id, recipient, status FROM emails WHERE id = $1",
      [emailId]
    );

    console.log("Verified record:", saved.rows[0]);

  } catch (error) {
    console.error("Database error:", error);
  } finally {
    await pool.end();
  }
}

main();