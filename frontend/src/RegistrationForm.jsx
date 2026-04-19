import { useState, useEffect } from "react";
import "./RegistrationForm.css";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const SECTIONS = ["A", "B", "C"];

export default function RegistrationForm({ onRegistered, onAdmin }) {
  const [form, setForm] = useState({ name: "", roll: "", gender: "", age: "", phone: "", section: "" });
  const [errors, setErrors] = useState({});
  const [seatsLeft, setSeatsLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [config, setConfig] = useState(null);

  useEffect(() => { 
    fetchSeats();
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw new Error(`Server Error: ${r.status}`);
        return r.json();
      })
      .then(setConfig)
      .catch(err => {
        console.error("Config fetch failed", err);
        setApiError("⚠️ Connectivity Issue: Cannot load event configuration. Ensure the backend is running.");
      });
  }, []);

  const fetchSeats = async () => {
    try {
      const res = await fetch("/api/seats-count");
      const data = await res.json();
      setSeatsLeft(data.available_seats);
    } catch {
      setSeatsLeft(null);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.roll.trim()) e.roll = "Roll number is required";
    if (!form.gender) e.gender = "Please select your gender";
    if (!form.phone.trim() || !/^\d{10}$/.test(form.phone.trim())) e.phone = "Enter a valid 10-digit phone number";
    if (!form.section) e.section = "Please select your section";
    if (!form.age || isNaN(form.age) || +form.age < 1 || +form.age > 120)
      e.age = "Enter a valid age";
    return e;
  };

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setApiError("");
    setLoading(true);

    try {
      const res = await fetch("/api/lock-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: form.roll,
          user_name: form.name.trim(),
          user_roll: form.roll.trim(),
          user_gender: form.gender,
          user_age: parseInt(form.age),
          user_phone: form.phone.trim(),
          user_section: form.section,
        }),
      });

      if (res.status === 400) {
        const txt = await res.text();
        if (txt === "Sold Out") {
          setApiError("🚫 All 43 seats are filled! Registration is now closed.");
        } else {
          setApiError("Registration failed. Please try again.");
        }
        setLoading(false);
        fetchSeats();
        return;
      }

      const data = await res.json();
      onRegistered({
        tokenId: data.token_id,
        lockTime: Date.now(),
        userDetails: { ...form },
      });
    } catch {
      setApiError("Cannot reach the server. Is the Flask app running?");
    }
    setLoading(false);
  };

  const soldOut = seatsLeft === 0;

  return (
    <div className="reg-container">
      <div className="blob blob-1" />
      <div className="blob blob-2" />

      {!config ? (
        <div style={{ zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <span className="spinner" style={{ width: "2rem", height: "2rem" }}></span>
        </div>
      ) : (
      <div className="reg-card">
        {/* Header */}
        <div className="reg-header">
          <div className="badge">🎟️ Event Registration</div>
          <h1 className="reg-title">{config.eventName}</h1>
          <div style={{ 
            color: "#f59e0b", 
            fontSize: "1.1rem", 
            fontWeight: "700", 
            marginTop: "0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px"
          }}>
            📍 BLR
          </div>
          <p className="reg-subtitle">Fill in your details to secure a seat</p>
        </div>

        {/* Seat counter */}
        <div className={`seats-pill ${soldOut ? "seats-pill--out" : ""}`}>
          <span className="seats-text" style={{ fontSize: "1.1rem", fontWeight: "600" }}>
            {seatsLeft === null ? "–" : seatsLeft} seats remaining
          </span>
          <button className="refresh-btn" onClick={fetchSeats} title="Refresh">↻</button>
        </div>

        {soldOut && (
          <div className="sold-out-banner">
            🚫 Registration Closed — All 43 seats have been filled.
          </div>
        )}

        {!soldOut && (
          <form onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <div className="field">
              <label className="field-label" htmlFor="f-name">Full Name</label>
              <input
                id="f-name"
                className={`field-input ${errors.name ? "field-input--err" : ""}`}
                type="text"
                placeholder="e.g. Ravi Kumar"
                value={form.name}
                onChange={handleChange("name")}
              />
              {errors.name && <p className="field-err">{errors.name}</p>}
            </div>

            {/* Roll number */}
            <div className="field">
              <label className="field-label" htmlFor="f-roll">Roll Number</label>
              <input
                id="f-roll"
                className={`field-input ${errors.roll ? "field-input--err" : ""}`}
                type="text"
                placeholder="e.g. 2023CS101"
                value={form.roll}
                onChange={handleChange("roll")}
              />
              {errors.roll && <p className="field-err">{errors.roll}</p>}
            </div>

            {/* Phone + Section side by side */}
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="f-phone">Phone Number</label>
                <input
                  id="f-phone"
                  className={`field-input ${errors.phone ? "field-input--err" : ""}`}
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={handleChange("phone")}
                />
                {errors.phone && <p className="field-err">{errors.phone}</p>}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="f-section">Section</label>
                <select
                  id="f-section"
                  className={`field-input field-select ${errors.section ? "field-input--err" : ""}`}
                  value={form.section}
                  onChange={handleChange("section")}
                >
                  <option value="">Select…</option>
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.section && <p className="field-err">{errors.section}</p>}
              </div>
            </div>

            {/* Gender + Age side by side */}
            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="f-gender">Gender</label>
                <select
                  id="f-gender"
                  className={`field-input field-select ${errors.gender ? "field-input--err" : ""}`}
                  value={form.gender}
                  onChange={handleChange("gender")}
                >
                  <option value="">Select…</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {errors.gender && <p className="field-err">{errors.gender}</p>}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="f-age">Age</label>
                <input
                  id="f-age"
                  className={`field-input ${errors.age ? "field-input--err" : ""}`}
                  type="number"
                  min="1"
                  max="120"
                  placeholder="21"
                  value={form.age}
                  onChange={handleChange("age")}
                />
                {errors.age && <p className="field-err">{errors.age}</p>}
              </div>
            </div>

            {/* Ticket price */}
            <div className="price-tag">
              Ticket Price: <strong>₹{config.ticketPrice}</strong>
            </div>

            {apiError && <div className="alert-error">{apiError}</div>}

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "Proceed to Payment →"}
            </button>

            <p className="disclaimer">
              A 5-minute payment window opens after submission.
            </p>
          </form>
        )}

      </div>
      )}
    </div>
  );
}
