
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Mail,
  Send,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  X,
  LogIn,
} from "lucide-react";
import Login from "./login.tsx";
import "./App.css";

const API = "http://localhost:4000/api/emails";
const PAGE_SIZE = 10;

type EmailStatus =
  | "scheduled"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

type Email = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduled_at: string;
  sent_at: string | null;
  status: EmailStatus;
  error: string | null;
};

type EmailResponse = {
  emails: Email[];
  total: number;
  totalPages: number;
};

function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const requestId = useRef(0);

  async function loadEmails() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");

    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
      };

      if (status !== "all") {
        params.status = status;
      }

      if (search.trim()) {
        params.search = search.trim();
      }

      const response = await axios.get<EmailResponse>(API, {
        params,
      });

      if (currentRequest !== requestId.current) return;

      setEmails(response.data.emails);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.message ||
            "Could not load emails. Check that your backend is running."
        );
      } else {
        setError("Could not load emails.");
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!loggedIn) return;

    loadEmails();

    const interval = window.setInterval(() => {
      loadEmails();
    }, 10000);

    return () => {
      window.clearInterval(interval);
      requestId.current++;
    };
  }, [loggedIn, status, search, page]);

  async function scheduleEmail(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setMessage("");
    setError("");

    const recipientList = recipients
      .split(/[\n,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

    if (recipientList.length === 0) {
      setError("Enter at least one recipient.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const invalidRecipients = recipientList.filter(
      (email) => !emailPattern.test(email)
    );

    if (invalidRecipients.length > 0) {
      setError(
        `Invalid email address: ${invalidRecipients.join(", ")}`
      );
      return;
    }

    if (!subject.trim()) {
      setError("Please enter a subject.");
      return;
    }

    if (!body.trim()) {
      setError("Please enter a message.");
      return;
    }

    if (
      !scheduledAt ||
      new Date(scheduledAt).getTime() <= Date.now()
    ) {
      setError("Please choose a future date and time.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await axios.post(`${API}/schedule`, {
        recipients: recipientList,
        subject: subject.trim(),
        body,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });

      setMessage(
        response.data.message ||
          `Successfully scheduled ${recipientList.length} email(s).`
      );

      setRecipients("");
      setSubject("");
      setBody("");
      setScheduledAt("");

      setPage(1);

      if (page === 1) {
        await loadEmails();
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.message || "Scheduling failed."
        );
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelEmail(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this scheduled email?"
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const response = await axios.delete(`${API}/${id}`);

      setMessage(
        response.data.message || "Email cancelled successfully."
      );

      await loadEmails();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.message ||
            "Could not cancel email."
        );
      } else {
        setError("Something went wrong.");
      }
    }
  }

  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  function changeSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const scheduledCount = emails.filter(
    (email) => email.status === "scheduled"
  ).length;

  const sentCount = emails.filter(
    (email) => email.status === "sent"
  ).length;

  const failedCount = emails.filter(
    (email) => email.status === "failed"
  ).length;

  const cancelledCount = emails.filter(
    (email) => email.status === "cancelled"
  ).length;

  const processingCount = emails.filter(
    (email) => email.status === "processing"
  ).length;

  const localMinDate = new Date(
    Date.now() - new Date().getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Mail size={21} />
          </div>
          <span>ReachInbox</span>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <div className="nav-item active">
          <Mail size={18} />
          Email campaigns
        </div>

        <div className="sidebar-bottom">
          Email Scheduler
          <br />
          <small>Development workspace</small>
          <button
            className="logout-btn"
            type="button"
            onClick={() => setLoggedIn(false)}
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">WORKSPACE / EMAILS</div>
            <h1>Email campaigns</h1>
            <p>Schedule, track, and manage your outreach.</p>
          </div>

          <button
            className="refresh"
            type="button"
            onClick={loadEmails}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        <section className="stats">
          <div className="stat-card">
            <div className="stat-top">
              <span>Total emails</span>
              <Mail />
            </div>
            <strong>{total}</strong>
            <small>Matching current filter</small>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Scheduled</span>
              <Clock />
            </div>
            <strong>{scheduledCount}</strong>
            <small>On this page</small>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Processing</span>
              <RefreshCw />
            </div>
            <strong>{processingCount}</strong>
            <small>On this page</small>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Sent</span>
              <Send />
            </div>
            <strong>{sentCount}</strong>
            <small>On this page</small>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Failed</span>
              <AlertCircle />
            </div>
            <strong>{failedCount}</strong>
            <small>On this page</small>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Cancelled</span>
              <X />
            </div>
            <strong>{cancelledCount}</strong>
            <small>On this page</small>
          </div>
        </section>

        <section className="content-grid">
          <div className="panel compose">
            <div className="panel-heading">
              <div>
                <h2>
                  <Plus size={19} />
                  Schedule an email
                </h2>
                <p>
                  Compose a message and choose when to send it.
                </p>
              </div>
            </div>

            <form onSubmit={scheduleEmail}>
              <label>Recipients</label>
              <textarea
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="name@example.com, another@example.com"
                rows={3}
                required
              />

              <small className="hint">
                Separate multiple addresses with commas or new lines.
              </small>

              <label>Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject"
                required
              />

              <label>Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email..."
                rows={5}
                required
              />

              <label>Schedule date and time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={localMinDate}
                required
              />

              <button
                className="primary"
                type="submit"
                disabled={submitting}
              >
                <Clock size={16} />
                {submitting ? "Scheduling..." : "Schedule email"}
              </button>
            </form>
          </div>

          <div className="panel email-panel">
            <div className="list-heading">
              <div>
                <h2>Recent emails</h2>
                <p>
                  View delivery status and scheduled messages.
                </p>
              </div>

              <select
                value={status}
                onChange={(e) => changeStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="processing">Processing</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="search-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                type="search"
                placeholder="Search recipient or subject..."
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
              />

              {search && (
                <button
                  className="clear-search"
                  type="button"
                  onClick={() => changeSearch("")}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {message && (
              <div className="success" role="status">
                {message}
              </div>
            )}

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div className="empty">Loading emails...</div>
            ) : emails.length === 0 ? (
              <div className="empty">
                <Mail size={30} />
                <strong>No emails found</strong>
                <span>
                  Schedule an email to see it here.
                </span>
              </div>
            ) : (
              <>
                <div className="email-list">
                  {emails.map((email) => (
                    <div className="email-row" key={email.id}>
                      <div className="email-main">
                        <strong>{email.subject}</strong>
                        <span>{email.recipient}</span>

                        <small>
                          Scheduled:{" "}
                          {new Date(
                            email.scheduled_at
                          ).toLocaleString()}
                        </small>

                        {email.sent_at && (
                          <small>
                            Sent:{" "}
                            {new Date(
                              email.sent_at
                            ).toLocaleString()}
                          </small>
                        )}

                        {email.error && (
                          <small className="error-text">
                            {email.error}
                          </small>
                        )}
                      </div>

                      <div className="email-actions">
                        <span
                          className={`status status-${email.status}`}
                        >
                          {email.status}
                        </span>

                        {email.status === "scheduled" && (
                          <button
                            className="cancel-btn"
                            type="button"
                            onClick={() => cancelEmail(email.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pagination">
                  <span>
                    Page {page} of {totalPages || 1} · {total} emails
                  </span>

                  <div className="page-buttons">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
<button
  onClick={() => {
    window.location.href =
      "http://localhost:4000/api/slack/install";
  }}
>
  Connect Slack
</button>
                    <button
                      type="button"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
