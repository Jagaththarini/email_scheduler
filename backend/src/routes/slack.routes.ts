
import { Router } from "express";
import crypto from "node:crypto";
import pool from "../db/pool.js";

const router = Router();
const USER_ID = "demo-user"; // Replace with authenticated user ID

function signState(value: string) {
  return crypto
    .createHmac("sha256", process.env.SLACK_STATE_SECRET!)
    .update(value)
    .digest("hex");
}

router.get("/install", (_req, res) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  const secret = process.env.SLACK_STATE_SECRET;

  if (!clientId || !redirectUri || !secret) {
    return res.status(500).send("Slack OAuth is not configured");
  }

  const nonce = crypto.randomBytes(24).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${nonce}.${timestamp}`;
  const state = `${payload}.${signState(payload)}`;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "chat:write",
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
});

router.get("/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const parts = state.split(".");

    if (parts.length !== 3 || !code) {
      return res.status(400).send("Invalid OAuth callback");
    }

    const [nonce, timestamp, signature] = parts;
    const payload = `${nonce}.${timestamp}`;
    const expected = signState(payload);

    const validSignature =
      signature.length === expected.length &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );

    const age = Date.now() - Number(timestamp);
    if (
      !validSignature ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 10 * 60 * 1000
    ) {
      return res.status(400).send("Invalid or expired OAuth state");
    }

    const tokenResponse = await fetch(
      "https://slack.com/api/oauth.v2.access",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: process.env.SLACK_CLIENT_ID!,
          client_secret: process.env.SLACK_CLIENT_SECRET!,
          redirect_uri: process.env.SLACK_REDIRECT_URI!,
        }),
      }
    );

    const data = await tokenResponse.json() as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { id?: string; name?: string };
    };

    if (!data.ok || !data.access_token || !data.team?.id) {
      console.error("Slack OAuth failed:", data.error);
      return res.status(400).send("Slack authorization failed");
    }

    await pool.query(
      `INSERT INTO slack_connections
         (user_id, team_id, team_name, bot_token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         team_id = EXCLUDED.team_id,
         team_name = EXCLUDED.team_name,
         bot_token = EXCLUDED.bot_token,
         channel_id = NULL,
         created_at = NOW()`,
      [
        USER_ID,
        data.team.id,
        data.team.name || null,
        data.access_token,
      ]
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/?slack=connected`
    );
  } catch (error) {
    console.error("Slack callback error:", error);
    res.status(500).send("Could not connect Slack");
  }
});

router.get("/status", async (_req, res) => {
  const result = await pool.query(
    `SELECT team_name, team_id, channel_id
     FROM slack_connections
     WHERE user_id = $1`,
    [USER_ID]
  );

  res.json({
    connected: result.rowCount !== 0,
    connection: result.rows[0] || null,
  });
});

export default router;