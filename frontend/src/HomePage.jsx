import { useState, useEffect } from "react";
import { EVENT_CONFIG } from "../config";
import "../styles/HomePage.css";

export default function HomePage({ onRegistered }) {
  const [seatsLeft, setSeatsLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch available seat count on mount
  useEffect(() => {
    fetchSeats();
  }, []);

  const fetchSeats = async () => {
    try {
      const res = await fetch(`${EVENT_CONFIG.apiBase}/get-all-tokens`);
      const tokens = await res.json();
      const available = tokens.filter((t) => t.status === "available").length;
      setSeatsLeft(available);
    } catch {
      setSeatsLeft("—");
    }
  };

  const handleRegister = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${EVENT_CONFIG.apiBase}/lock-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: EVENT_CONFIG.rollNumber }),
      });

      if (res.status === 400) {
        setError("Sorry, all seats are sold out!");
        setLoading(false);
        return;
      }

      const data = await res.json();
      onRegistered({ tokenId: data.token_id, lockTime: Date.now() });
    } catch {
      setError("Could not reach the server. Is the Flask app running?");
    }
    setLoading(false);
  };

  return (
    <div className="home-container">
      {/* Decorative blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      <div className="home-card">
        {/* Header */}
        <div className="home-header">
          <div className="badge">🎟️ Event Registration</div>
          <h1 className="home-title">{EVENT_CONFIG.eventName}</h1>
          <p className="home-subtitle">Secure your spot for an unforgettable experience</p>
        </div>

        {/* Participant info */}
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Roll No</span>
            <span className="info-value">{EVENT_CONFIG.rollNumber}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Name</span>
            <span className="info-value">{EVENT_CONFIG.name}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Gender</span>
            <span className="info-value">{EVENT_CONFIG.gender}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Age</span>
            <span className="info-value">{EVENT_CONFIG.age}</span>
          </div>
        </div>

        {/* Seats left */}
        <div className="seats-banner">
          <div className="seats-icon">💺</div>
          <div>
            <div className="seats-count">
              {seatsLeft === null ? "Loading..." : seatsLeft}
            </div>
            <div className="seats-label">seats remaining</div>
          </div>
          <button className="refresh-btn" onClick={fetchSeats} title="Refresh">
            ↻
          </button>
        </div>

        {/* Ticket price */}
        <div className="price-tag">
          Ticket Price: <strong>₹{EVENT_CONFIG.ticketPrice}</strong>
        </div>

        {/* Error */}
        {error && <div className="alert-error">{error}</div>}

        {/* Register Button */}
        <button
          className="register-btn"
          onClick={handleRegister}
          disabled={loading || seatsLeft === 0}
        >
          {loading ? (
            <span className="spinner" />
          ) : seatsLeft === 0 ? (
            "Sold Out"
          ) : (
            "🎫 Register Now"
          )}
        </button>

        <p className="disclaimer">
          A 5-minute payment window will open after clicking Register.
        </p>
      </div>
    </div>
  );
}
