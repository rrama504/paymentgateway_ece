import { useState, useEffect } from "react";
import "./AdminPage.css";

const STATUS_COLOR = {
  available: "#94a3b8",
  locked:    "#f59e0b",
  confirmed: "#10b981",
};

export default function AdminPage({ onBack }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatTime = (time) => {
    if (!time) return "—";
    if (typeof time === "number") {
      const date = new Date(time < 1e12 ? time * 1000 : time);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const date = new Date(time);
    return !isNaN(date) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—";
  };

  const fetchTokens = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("/api/get-all-tokens", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setTokens(await res.json());
      } else if (res.status === 401) {
        // Token expired/invalid
        alert("Session expired. Please log in again.");
        onBack(); // Triggers logout and clears state
      }
    } catch (err) {
      console.error("Failed to fetch tokens", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchTokens(); // Initial fetch
    const intervalId = setInterval(fetchTokens, 5000);
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const handleConfirm = async (tokenId) => {
    try {
      const token = localStorage.getItem("adminToken");
      await fetch("/api/confirm-payment", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ token_id: tokenId }),
      });
      fetchTokens(); // Refresh list immediately after action
    } catch (err) {
      console.error("Error confirming payment", err);
    }
  };

  const handleReject = async (tokenId) => {
    // Only reject if user is sure, optional confirm dialog can be added here
    if (!window.confirm(`Are you sure you want to reject payment for ${tokenId}?`)) return;
    
    try {
      const token = localStorage.getItem("adminToken");
      await fetch("/api/reject-payment", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ token_id: tokenId }),
      });
      fetchTokens(); // Refresh list immediately after action
    } catch (err) {
      console.error("Error rejecting payment", err);
    }
  };

  return (
    <div className="admin-container">
      {/* Background decoration */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className="admin-wrapper">
        <div className="admin-topbar">
          <div className="admin-title-wrap">
            <div className="badge">🔐 Admin Panel</div>
            <h1 className="admin-title">Token Management</h1>
          </div>
          <div className="admin-topbar-right">
            <div className="auto-refresh-badge">
              <div className="pulsing-dot" /> Auto-refreshing (5s)
            </div>
            <button className="refresh-btn" onClick={fetchTokens}>↻ Refresh Now</button>
            <button className="back-btn" onClick={onBack}>← Back</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="token-table">
            <thead>
              <tr>
                <th>Token ID</th>
                <th>Status</th>
                <th>User Details</th>
                <th>Gender / Age</th>
                <th>Payment Time</th>
                <th>UTR No.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && tokens.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>Loading tokens...</td>
                </tr>
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>No tokens available.</td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr key={token.token_id}>
                    <td className="td-token">{token.token_id}</td>
                    <td>
                      <span 
                        className="status-badge" 
                        style={{ 
                          background: `${STATUS_COLOR[token.status]}22`, 
                          color: STATUS_COLOR[token.status] 
                        }}
                      >
                        {token.status}
                      </span>
                    </td>
                    <td>
                      {token.locked_by ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong>{token.user_name || token.locked_by}</strong>
                          {token.user_roll && <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Roll: {token.user_roll}</span>}
                          {token.user_phone && <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Ph: {token.user_phone}</span>}
                          {token.user_section && <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Sec: {token.user_section}</span>}
                        </div>
                      ) : (
                        <span className="disabled-text">—</span>
                      )}
                    </td>
                    <td>
                      {token.locked_by && (token.user_gender || token.user_age) ? (
                        <span style={{ fontSize: "0.9rem" }}>
                          {token.user_gender || "—"} / {token.user_age || "—"} yrs
                        </span>
                      ) : (
                        <span className="disabled-text">—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
                        {formatTime(token.lock_time)}
                      </span>
                    </td>
                    <td className="td-utr">{token.utr ? token.utr : <span className="disabled-text">—</span>}</td>
                    <td>
                      <div className="action-buttons">
                        {token.status === "locked" && (
                          <>
                            <button 
                              className="confirm-btn" 
                              onClick={() => handleConfirm(token.token_id)}
                              title="Confirm Payment"
                            >
                              ✓ Confirm
                            </button>
                            <button 
                              className="reject-btn" 
                              onClick={() => handleReject(token.token_id)}
                              title="Reject Payment"
                            >
                              ✕ Reject
                            </button>
                          </>
                        )}
                        {token.status === "confirmed" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span className="disabled-text" style={{ color: "#10b981", fontWeight: "bold" }}>✅ Approved</span>
                            <button 
                              className="reject-btn" 
                              onClick={() => handleReject(token.token_id)}
                              title="Revoke and Remove Payment"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                            >
                              ✕ Revoke
                            </button>
                          </div>
                        )}
                        {token.status === "available" && (
                          <span className="disabled-text">Waiting...</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
