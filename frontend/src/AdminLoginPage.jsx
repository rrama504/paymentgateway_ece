import { useState } from "react";
import "./AdminLoginPage.css";

export default function AdminLoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password");
      return;
    }
    
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("adminToken", data.token);
        onLoginSuccess();
      } else {
        setError("Invalid credentials. Access denied.");
      }
    } catch {
      setError("Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🛡️</div>
          <h1 className="login-title">Restricted Area</h1>
          <p className="login-subtitle">Secure Admin Authentication</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="field">
            <label className="field-label" htmlFor="username">Admin Username</label>
            <input
              id="username"
              className="field-input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">Passkey</label>
            <input
              id="password"
              className="field-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="submit-btn" type="submit" disabled={loading} style={{ marginTop: "1rem" }}>
            {loading ? <span className="spinner" /> : "Authenticate 🔒"}
          </button>
        </form>
      </div>
    </div>
  );
}
