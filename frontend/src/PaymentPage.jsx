import { useState, useEffect, useCallback } from "react";
import "./PaymentPage.css";

export default function PaymentPage({ tokenId, lockTime, userDetails, onExpired, onSuccess }) {
  const [config, setConfig] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expired, setExpired] = useState(false);

  // Fetch config on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        if (data.lockDurationSeconds) {
          const elapsed = Math.floor((Date.now() - lockTime) / 1000);
          setSecondsLeft(data.lockDurationSeconds - elapsed);
        }
      })
      .catch(err => {
        console.error("Config fetch failed", err);
        setError("Failed to load payment configuration.");
      });
  }, [lockTime]);

  // Timer logic
  useEffect(() => {
    if (!config || expired || success) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [config, expired, success]);

  const handleSubmit = useCallback(async () => {
    if (!utr.trim()) {
      setError("Please enter your UTR / transaction ID.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/submit-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_id: tokenId, utr: utr.trim() }),
      });

      if (!res.ok) {
        setError("Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      onSuccess?.();
    } catch {
      setError("Could not reach the server.");
    }
    setSubmitting(false);
  }, [utr, tokenId]);

  if (!config) {
    return (
      <div className="pay-container">
        <div className="pay-card" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
          <span className="spinner"></span>
        </div>
      </div>
    );
  }

  const minutes = String(Math.floor(Math.max(0, secondsLeft) / 60)).padStart(2, "0");
  const seconds = String(Math.max(0, secondsLeft) % 60).padStart(2, "0");
  const progress = (secondsLeft / config.lockDurationSeconds) * 100;
  const progressColor = progress > 50 ? "#22c55e" : progress > 20 ? "#f59e0b" : "#ef4444";

  // Token IDs are EVENT-### (EVENT-001 … EVENT-043). Alternate QR/UPI for seats 13–43.
  const tokenNumber = Number.parseInt((tokenId || "").split("-").pop() || "", 10);
  const useArjunQr =
    Number.isFinite(tokenNumber) && tokenNumber >= 13 && tokenNumber <= 43;
  const qrImageSrc = useArjunQr ? "/QR2.jpeg" : "/QR.jpeg";
  const effectiveUpiId = useArjunQr ? "arjun.kondala2005@okaxis" : config.upiId;
  const upiLink = `upi://pay?pa=${effectiveUpiId}&pn=${encodeURIComponent(config.payeeName)}&am=${config.ticketPrice}&tn=${tokenId}`;

  if (expired) {
    return (
      <div className="pay-container">
        <div className="blob blob-1" /><div className="blob blob-2" />
        <div className="pay-card expired-card">
          <div className="expired-icon">⏰</div>
          <h2 className="expired-title">Session Expired</h2>
          <p className="expired-sub">Your window has ended. The seat has been released.</p>
          <button className="back-btn" onClick={onExpired}>← Try Again</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="pay-container">
        <div className="blob blob-1" /><div className="blob blob-2" />
        <div className="pay-card success-card">
          <div className="success-icon">✅</div>
          <h2 className="success-title">Payment Received.</h2>
          <p className="success-sub">Confirmation will be provided shortly after verification.</p>
          <div className="success-token">{tokenId}</div>
          <div className="success-utr">UTR: {utr}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pay-container">
      <div className="blob blob-1" /><div className="blob blob-2" />

      <div className="pay-card">
        <div className="pay-header">
          <div className="badge">💳 Complete Payment</div>
          <h2 className="pay-title">{config.eventName}</h2>
        </div>

        <div className="user-summary">
          <div className="us-chip">{userDetails?.name}</div>
          <div className="us-chip">{userDetails?.roll}</div>
          <div className="us-chip">Sec: {userDetails?.section}</div>
        </div>

        <div className="token-band">
          <span className="token-label">Your Token</span>
          <span className="token-value">{tokenId}</span>
        </div>

        <div className="timer-section">
          <div className="timer-label">Time remaining to pay</div>
          <div className="timer-display" style={{ color: progressColor }}>
            {minutes}:{seconds}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.max(0, progress)}%`, background: progressColor }} />
          </div>
        </div>

        <div className="upi-section">
          <p className="upi-title">Pay <strong>₹{config.ticketPrice}</strong> via UPI QR Code</p>
          <div className="qr-box" style={{ background: "white", padding: "12px", borderRadius: "12px", display: "inline-block", margin: "1rem 0", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <img src={qrImageSrc} alt="Payment QR" style={{ width: "180px", height: "180px", objectFit: "contain" }} />
          </div>
          <div className="upi-details">
            <span>UPI ID: <strong style={{ userSelect: "all" }}>{effectiveUpiId}</strong></span>
            <span>Ref: <strong>{tokenId}</strong></span>
          </div>
        </div>

        <div className="utr-section">
          <label className="utr-label" htmlFor="utr-input">Enter UTR / Transaction ID</label>
          <input
            id="utr-input"
            className="utr-input"
            type="text"
            placeholder="e.g. UTR123456789012"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
          />
          {error && <p className="utr-error">{error}</p>}
        </div>

        <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <span className="spinner" /> : "Submit Payment →"}
        </button>

        <p className="pay-disclaimer">
          After payment, enter your UTR above and click Submit.
        </p>
      </div>
    </div>
  );
}

