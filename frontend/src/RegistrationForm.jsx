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

      <div className="reg-card reg-card--message">
        <div className="reg-header">
          <div className="badge">📢 Important Update</div>
          <h1 className="reg-title">Booking Closed</h1>
          <p className="reg-subtitle">Registrations for both the Bangalore and Hyderabad trips are now closed.</p>
        </div>

        <div className="message-body" style={{ textAlign: "center", padding: "1rem 0", lineHeight: 1.75 }}>
          <p style={{ marginBottom: "1rem" }}>
            For any pending payments, transaction-related issues, or incomplete registrations, please contact <strong>RamaKrishna – 8688423718</strong>.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            For queries regarding the trip or its execution, please reach out to:<br />
            <strong>Avinash – 8500113117</strong><br />
            <strong>Mukesh – 9989145666</strong><br />
            <strong>Arjun – 9989743999</strong>
          </p>
          <p style={{ marginTop: "1.5rem", fontWeight: 700, color: "#0f766e" }}>
            Please note that the Wonderla payment window will open shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
