import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import RegistrationForm from "./RegistrationForm";
import PaymentPage from "./PaymentPage";
import AdminPage from "./AdminPage";
import AdminLoginPage from "./AdminLoginPage";
import "./App.css";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initial session from localStorage if present
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem("paymentSession");
    return saved ? JSON.parse(saved) : null;
  });

  const [unauthorized, setUnauthorized] = useState(false);
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [relaxedSecurity, setRelaxedSecurity] = useState(false);

  useEffect(() => {
    // Sync session to localStorage
    if (session) {
      localStorage.setItem("paymentSession", JSON.stringify(session));
    } else {
      localStorage.removeItem("paymentSession");
    }
  }, [session]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")) ||
        (e.ctrlKey && (e.key === "U" || e.key === "u")) ||
        (e.metaKey && e.altKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j"))
      ) {
        e.preventDefault();
        setUnauthorized(true);
      }
    };
    
    const handleContextMenu = (e) => {
      e.preventDefault();
      setUnauthorized(true);
    };

    const handleFullscreenChange = () => {
      if (window.innerWidth > 768) {
        setIsFullscreen(!!document.fullscreenElement);
      } else {
        setIsFullscreen(true);
      }
    };
    
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsFullscreen(!!document.fullscreenElement);
      } else {
        setIsFullscreen(true);
      }
    };

    window.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);

    handleResize();

    return () => {
      window.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const handleRegistered = ({ tokenId, lockTime, userDetails }) => {
    setSession({ tokenId, lockTime, userDetails });
    navigate("/payment");
  };

  const handleBack = () => {
    setSession(null);
    setRelaxedSecurity(false);
    navigate("/");
  };

  const isAdminPath = location.pathname === "/admin";

  return (
    <div className="app-root">
      {unauthorized ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#0f172a", color: "#ef4444", fontSize: "2rem", fontWeight: "bold" }}>
          Not Authorized
        </div>
      ) : (!isFullscreen && !relaxedSecurity && !isAdminPath) ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "2rem", alignItems: "center", height: "100vh", backgroundColor: "#020617", color: "#f8fafc", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "2.5rem", background: "linear-gradient(to right, #ef4444, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Full Screen Mode Required</h1>
          <p style={{ fontSize: "1.2rem", color: "#cbd5e1" }}>
            Please enter full screen to continue.
          </p>
          <button 
            onClick={() => document.documentElement.requestFullscreen().catch(() => alert("Your browser blocked fullscreen."))}
            style={{ padding: "1rem 2rem", fontSize: "1.2rem", fontWeight: "bold", background: "#3b82f6", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.5)" }}
          >
            Enter Full Screen
          </button>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<RegistrationForm onRegistered={handleRegistered} />} />
          
          <Route path="/payment" element={
            session ? (
              <PaymentPage
                tokenId={session.tokenId}
                lockTime={session.lockTime}
                userDetails={session.userDetails}
                onExpired={handleBack}
                onSuccess={() => {
                  setRelaxedSecurity(true);
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
              />
            ) : (
              <Navigate to="/" replace />
            )
          } />

          <Route path="/admin" element={
            isAdminAuth ? (
              <AdminPage onBack={() => { 
                  setIsAdminAuth(false);
                  localStorage.removeItem("adminToken");
                  navigate("/"); 
              }} />
            ) : (
              <AdminLoginPage onLoginSuccess={() => setIsAdminAuth(true)} />
            )
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </div>
  );
}
