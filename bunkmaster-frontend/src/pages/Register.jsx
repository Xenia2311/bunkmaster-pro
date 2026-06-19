import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import "./Auth.css";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await register({ name, email, password });
      navigate("/sections");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(Array.isArray(err.details) ? err.details.map((d) => d.msg).join(" ") : err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <div className="surface auth-card">
        <div className="auth-card__brand">
          <div className="auth-card__brand-mark">BM</div>
          <div className="auth-card__brand-text">
            <div className="auth-card__brand-name">BunkMaster Pro</div>
            <div className="auth-card__brand-tagline eyebrow">Calculated risks for the academic ninja</div>
          </div>
        </div>

        <h2>Create account</h2>
        <p className="auth-card__sub">Start tracking your attendance — no more manual tallying.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" type="text" value={name}
              onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={8}
              autoComplete="new-password" />
            <span className="eyebrow" style={{ marginTop: 2 }}>At least 8 characters</span>
          </div>
          <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
            {loading ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <div className="auth-card__footer">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
