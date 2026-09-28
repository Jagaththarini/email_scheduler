# ReachInbox – Email Scheduler

A full-stack email scheduling application that lets users compose emails, select a future delivery time, and track email status through a dashboard.

> **Project status:** Development version. Verify the end-to-end flow, authentication, deployment, and optional integrations before describing them as complete.

## Features

- Schedule emails for a future date and time.
- Support multiple recipients (ideally create one database row and queued job per recipient).
- View email records and filter by status.
- Search by recipient or subject.
- Cancel emails that are still scheduled.
- Background processing with BullMQ and Redis.
- Configurable worker concurrency and hourly rate limit.
- SMTP sending with Nodemailer.
- Track `scheduled`, `processing`, `sent`, `failed`, and `cancelled` states.
- Retry failed jobs using BullMQ retry/backoff options.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| API | Node.js, Express, TypeScript |
| Database | PostgreSQL (Supabase) |
| Queue | Redis, BullMQ, ioredis |
| Email | Nodemailer, SMTP |
| HTTP client | Axios |

## Architecture

```text
React Dashboard
      |
      | HTTP (Axios)
      v
Express API --------> PostgreSQL
      |               Store email data/status
      v
Redis / BullMQ
      |
      v
Email Worker -------> SMTP Provider
      |
      v
Update PostgreSQL
      |
      v
Dashboard refreshes status
```

### Email lifecycle

1. The API validates recipients, subject, body, and the future schedule time.
2. The API stores email record(s) in PostgreSQL.
3. The API adds delayed job(s) to BullMQ using the scheduled timestamp.
4. When a job becomes eligible, the worker claims the database row and sets `processing`.
5. The worker sends the email through SMTP.
6. On SMTP acceptance, the worker sets `sent` and records `sent_at`.
7. On a sending error, the worker records the error and BullMQ may retry according to job options.

**Timing note:** Delayed jobs become eligible around the requested time; this is not a hard real-time guarantee. Worker load, the hourly limiter, Redis, network latency, and SMTP response time can affect actual processing time. SMTP acceptance does not prove inbox delivery.

## Example Project Structure

Adjust names to match your repository:

```text
reachinbox/
├── backend/
│   ├── src/
│   │   ├── db/pool.ts
│   │   ├── queues/email.queue.ts
│   │   ├── routes/email.routes.ts
│   │   ├── workers/email.worker.ts
│   │   └── server.ts
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── App.css
    │   └── login.tsx
    ├── package.json
    └── .env.example
```

## Prerequisites

- Node.js (current LTS recommended)
- npm
- PostgreSQL database
- Redis instance
- SMTP credentials (use a test SMTP service during development)

Run three processes locally: API, worker, and frontend.

## Environment Variables

Create `backend/.env` and fill in your provider credentials. Never commit `.env` or share secrets.

```dotenv
PORT=4000
FRONTEND_URL=http://localhost:5173

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE

REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true

SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

WORKER_CONCURRENCY=5
EMAILS_PER_HOUR=100
```

Set `REDIS_TLS=true` if your provider requires TLS, otherwise `false`. SMTP port 465 normally uses `secure: true`; port 587 normally uses STARTTLS. Follow your providers' current connection and SSL instructions.

If your frontend is configured to read an API URL from Vite environment variables, create `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:4000/api
```

The frontend must use `import.meta.env.VITE_API_URL` for this variable to take effect. If it hardcodes `http://localhost:4000/api/emails`, update it before deployment.

## Database Setup

Reference schema (align it with the columns used by your API):

```sql
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY,
  user_id TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at
  ON emails (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_emails_status
  ON emails (status);
```

If your existing status constraint does not include `cancelled`:

```sql
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_status_check;

ALTER TABLE emails
ADD CONSTRAINT emails_status_check
CHECK (status IN ('scheduled', 'processing', 'sent', 'failed', 'cancelled'));
```

The API-generated email ID must be reused as the BullMQ job's `emailId`.

## Installation and Run

Open three terminals from your project directory.

### 1. Backend dependencies

```bash
cd backend
npm install
```

Ensure your `backend/package.json` includes scripts appropriate to your file paths. Example:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "worker": "tsx watch src/workers/email.worker.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

Change the worker path if your file is located elsewhere. Install the packages imported by your code, such as `express`, `cors`, `dotenv`, `pg`, `ioredis`, `bullmq`, `nodemailer`, `tsx`, `typescript`, and the needed type packages.

Create and populate `backend/.env`.

### 2. Start API

```bash
cd backend
npm run dev
```

With `PORT=4000`, the API should run at `http://localhost:4000`.

Health check: `GET http://localhost:4000/health`

Expected response:

```json
{ "status": "ok" }
```

### 3. Start worker

In another terminal:

```bash
cd backend
npm run worker
```

Keep the worker running so it can process jobs when they become due.

### 4. Start frontend

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (commonly `http://localhost:5173`).

## API Endpoints

Confirm exact request/response formats against your backend route implementation.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/emails` | List emails; pagination, status filter, search |
| `POST` | `/api/emails/schedule` | Schedule email(s) |
| `DELETE` | `/api/emails/:id` | Cancel a scheduled email |

### List emails

Example:

```http
GET /api/emails?page=1&limit=10&status=sent&search=hello
```

Expected response shape for the current frontend:

```json
{
  "emails": [],
  "total": 0,
  "totalPages": 0
}
```

### Schedule email

The frontend sends `scheduledAt` as an ISO timestamp:

```json
{
  "recipients": ["person@example.com"],
  "subject": "Hello",
  "body": "A scheduled message",
  "scheduledAt": "2026-10-01T10:30:00.000Z"
}
```

The API should validate input, store the record(s), calculate the delay from the timestamp, and enqueue corresponding job(s).

### Cancel email

```http
DELETE /api/emails/EMAIL_UUID
```

Cancellation should update the database and remove or neutralize the queued job. The worker should check the database status before sending.

## Queue, Concurrency, Rate Limit, and Retries

The worker reads:

- `WORKER_CONCURRENCY`: maximum jobs this worker processes concurrently (default `5`).
- `EMAILS_PER_HOUR`: BullMQ limiter maximum per configured duration (default `100`).

Set retry options when adding jobs, for example:

```ts
{
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000
  }
}
```

Confirm the limiter's intended scope if running multiple worker instances and check the behavior supported by your BullMQ version.

### Recovery and delivery caveats

- A worker can stop after a row is marked `processing`; implement a recovery/reconciliation strategy for stale records.
- Retrying after an uncertain SMTP outcome can create duplicate emails. Ordinary SMTP does not guarantee exactly-once delivery.
- If SMTP accepted a message but PostgreSQL failed to record `sent`, reconcile that record instead of blindly resending.
- Dashboard polling only displays the latest API response; it does not itself process or send emails.

## Testing Checklist

- [ ] API starts and `/health` returns `{"status":"ok"}`.
- [ ] Worker connects to Redis and stays running.
- [ ] Frontend loads and reaches the API.
- [ ] Invalid email addresses are rejected.
- [ ] Past schedule times are rejected.
- [ ] A future email is stored as `scheduled`.
- [ ] At due time, the job is processed and status changes to `processing`.
- [ ] SMTP accepts the email and the row changes to `sent` with `sent_at`.
- [ ] Simulated SMTP errors follow retry settings and record an error.
- [ ] A scheduled email can be cancelled before processing.
- [ ] Search, status filters, pagination, and refresh work.
- [ ] Measure the difference between requested time and worker start time under load.

Use a test SMTP account while developing. Send only to recipients you control or have permission to contact.

## Deployment Notes

A possible arrangement:

- Frontend: static hosting (for example, Vercel).
- API: Node.js web service.
- Worker: separate always-on background worker.
- Database: hosted PostgreSQL.
- Queue: hosted Redis.

Set environment variables in each hosting service. API and worker must use the same database and Redis settings. Configure backend CORS for the deployed frontend origin and use the deployed backend URL in the frontend.

Do not deploy with `localhost` API URLs. Configure the host's health check to use `/health` (or add a root route if required by the platform).

## Security

- Keep `.env` out of Git; commit only placeholder values in `.env.example`.
- Rotate credentials if they were exposed.
- Validate request payloads and use parameterized SQL.
- Add server-side authentication and authorization before handling user-specific email data.
- A frontend-only demo login is not production authentication.
- Protect scheduling and cancellation endpoints from unauthorized access and abuse.
- Use HTTPS in production and follow provider-specific TLS guidance.

## Not Yet Confirmed

Verify these before calling the project production-ready:

- Server-side authentication and per-user authorization.
- Stale `processing` recovery and queue/database reconciliation.
- Duplicate-send handling for uncertain SMTP outcomes.
- Rate-limit behavior across multiple worker instances.
- Elasticsearch integration (not included unless it is actually connected).
- OAuth or Slack integration (not part of this core README).
- Deployment, monitoring, and end-to-end tests.

## License

Add the license and ownership details appropriate for your assignment or repository.
