import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../api/bulkImport";
import { useAuth } from "../context/AuthContext";
import "../styles/page.css";

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError("New passwords don't match."); return; }
    if (next.length < 8)  { setError("New password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="eyebrow">Account</div>
      <h1 className="page-title">Change password</h1>
      <p className="page-sub">
        {user?.name ? `Logged in as ${user.name}.` : ""} If you were pre-registered, your default password is your phone number.
      </p>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">Password changed! Redirecting…</div>}

      <form className="surface" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="current">Current password</label>
          <input id="current" type="password" value={current}
            onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="field">
          <label htmlFor="next">New password</label>
          <input id="next" type="password" value={next}
            onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
          <span className="eyebrow">At least 8 characters</span>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>
        <button className="btn btn--primary btn--block" type="submit" disabled={loading || success}>
          {loading ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
