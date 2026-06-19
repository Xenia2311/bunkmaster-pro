import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createSection, joinSection } from "../api/sections";
import { ApiError } from "../api/client";
import "./Sections.css";

export default function Sections() {
  const { memberships, refreshMe, switchSection, activeSectionId } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("join"); // "join" | "create"
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Join form state
  const [joinCode, setJoinCode] = useState("");
  const [batchNumber, setBatchNumber] = useState("1");

  // Create form state
  const [sectionName, setSectionName] = useState("");
  const [institutionName, setInstitutionName] = useState("");

  async function handleJoin(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await joinSection({ joinCode: joinCode.trim().toUpperCase(), batchNumber: Number(batchNumber) });
      await refreshMe();
      switchSection(res.section.id);
      setSuccess(`Joined ${res.section.name}!`);
      setJoinCode("");
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join section.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await createSection({ name: sectionName.trim(), institutionName: institutionName.trim() || undefined });
      await refreshMe();
      switchSection(res.section.id);
      setSuccess(`Created ${res.section.name}! Join code: ${res.section.joinCode}`);
      setSectionName("");
      setInstitutionName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create section.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="eyebrow">Sections</div>
      <h1 className="page-title">Your classes</h1>
      <p className="page-sub">Join an existing class with a code from your CR/SR, or start a new one.</p>

      {memberships.length > 0 && (
        <div className="surface section-list">
          {memberships.map((m) => (
            <div key={m.sectionId} className={`section-list__item${m.sectionId === activeSectionId ? " section-list__item--active" : ""}`}>
              <div>
                <div className="section-list__name">{m.section.name}</div>
                <div className="eyebrow">
                  {m.role.toUpperCase()} · Batch {m.batchNumber} · Code: <span className="mono">{m.section.joinCode}</span>
                </div>
              </div>
              {m.sectionId === activeSectionId ? (
                <span className="eyebrow text-go">Active</span>
              ) : (
                <button className="btn btn--ghost" onClick={() => { switchSection(m.sectionId); navigate("/"); }}>
                  Switch
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="section-tabs">
        <button
          className={`section-tabs__btn${mode === "join" ? " section-tabs__btn--active" : ""}`}
          onClick={() => setMode("join")}
        >
          Join with code
        </button>
        <button
          className={`section-tabs__btn${mode === "create" ? " section-tabs__btn--active" : ""}`}
          onClick={() => setMode("create")}
        >
          Create a new class
        </button>
      </div>

      {mode === "join" ? (
        <form className="surface" onSubmit={handleJoin}>
          <div className="field">
            <label htmlFor="joinCode">Join code</label>
            <input
              id="joinCode"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. 7K2QXP"
              required
              className="mono"
              style={{ textTransform: "uppercase" }}
            />
          </div>
          <div className="field">
            <label htmlFor="batchNumber">Your lab batch</label>
            <select id="batchNumber" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)}>
              <option value="1">Batch 1</option>
              <option value="2">Batch 2</option>
              <option value="3">Batch 3</option>
              <option value="4">Batch 4</option>
            </select>
          </div>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Joining..." : "Join class"}
          </button>
        </form>
      ) : (
        <form className="surface" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="sectionName">Class / section name</label>
            <input
              id="sectionName"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="e.g. CS 3rd Year - Section B"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="institutionName">Institution (optional)</label>
            <input
              id="institutionName"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="e.g. ABC Institute of Technology"
            />
          </div>
          <p className="text-ghost" style={{ marginBottom: 16, fontSize: "0.85rem" }}>
            You'll become the Class Representative (CR) and get a join code to share.
          </p>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create class"}
          </button>
        </form>
      )}
    </div>
  );
}
