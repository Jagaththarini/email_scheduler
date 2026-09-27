
import { useState } from "react";
import "./App.css"
type LoginProps = {
  onLogin: () => void;
};

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    // Demo-only credentials. Replace with backend authentication.
    if (
      email === "demo@reachinbox.ai" &&
      password === "Demo@123"
    ) {
      setError("");
      onLogin();
    } else {
      setError("Invalid email or password");
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">Reach<span>Inbox</span></div>
        <h1>Welcome back</h1>
        <p className="login-subtitle">
          Sign in to manage your email campaigns
        </p>

        <form onSubmit={handleLogin}>
          <label>Email address</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>
          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="show-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="login-submit" type="submit">
            Sign in
          </button>
        </form>

        <div className="demo-credentials">
          <strong>Demo credentials</strong>
          <p>Email: demo@reachinbox.ai</p>
          <p>Password: Demo@123</p>
        </div>
      </div>
    </div>
  );
}