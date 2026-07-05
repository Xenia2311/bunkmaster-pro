import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createSection, joinSection, updateMyBatch } from "../api/sections";
import { ApiError } from "../api/client";
import "./Sections.css";

const BRANCHES = ["CST", "CS", "IT", "AI", "DS", "ENC"];
const YEARS = [
  { value: "First",  label: "1st Year" },
  { value: "Second", label: "2nd Year" },
  { value: "Third",  label: "3rd Year" },
  { value: "Fourth", label: "4th Year" },
];

export default function Sections() {
  const { memberships, user, refreshMe, switchSection, activeSectionId } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]       = useState("join");
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Join form
  const [joinCode, setJoinCode]       = useState("");
  const [batchNumber, setBatchNumber] = useState("1");

  // Create form
  const [branch, setBranch]                   = useState("");
  const [year, setYear]                       = useState("");
  const [institutionName, setInstitutionName] = useState("");

  // Batch change
  const [changingBatchFor, setChangingBatchFor] = useState(null); // sectionId
  const [newBatch, setNewBatch]                 = useState("1");

  async function handleJoin(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      const res = await joinSection({
        joinCode:    joinCode.trim().toUpperCase(),
        batchNumber: Number(batchNumber),
      });
      await refreshMe();
      switchSection(res.section.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join class.");
    } finally { setSubmitting(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      const res = await createSection({
        branch,
        year,
        institutionName: institutionName.trim() || undefined,
      });
      await refreshMe();
      switchSection(res.section.id);
      setSuccess(`Created ${res.section.name}! Join code: ${res.section.joinCode}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create class.");
    } finally { setSubmitting(false); }
  }

  async function handleBatchChange(sectionId) {
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      await updateMyBatch(sectionId, user.id, Number(newBatch));
      await refreshMe();
      setChangingBatchFor(null);
      setSuccess("Batch updated successfully.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update batch.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="app-shell">
      <div className="eyebrow">Classes</div>
      <h1 className="page-title">Your classes</h1>
      <p className="page-sub">
        Join an existing class with a code from your CR/SR, or create a new one.
      </p>

      {/* ── Active memberships ── */}
      {memberships.length > 0 && (
        <div className="surface section-list">
          {memberships.map((m) => (
            <div
              key={m.sectionId}
              className={`section-list__item${m.sectionId === activeSectionId ? " section-list__item--active" : ""}`}
            >
              <div className="section-list__info">
                <div className="section-list__name">{m.section.name}</div>
                <div className="eyebrow">
                  {m.role.toUpperCase()} · Batch {m.batchNumber}
                  {m.rollNumber ? ` · #${m.rollNumber}` : ""}
                  {" · "}Code: <span className="mono">{m.section.joinCode}</span>
                </div>
              </div>

              <div className="section-list__actions">
                {/* Batch change (students only — CR/SR don't need to self-change) */}
                {m.role === "student" && changingBatchFor === m.sectionId ? (
                  <div className="batch-change">
                    <select
                      value={newBatch}
                      onChange={(e) => setNewBatch(e.target.value)}
                      className="batch-change__select"
                    >
                      {[1,2,3,4].map((b) => (
                        <option key={b} value={b}>Batch {b}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn--go btn--sm"
                      onClick={() => handleBatchChange(m.sectionId)}
                      disabled={submitting}
                    >Save</button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setChangingBatchFor(null)}
                    >✕</button>
                  </div>
                ) : (
                  <>
                    {m.role === "student" && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { setChangingBatchFor(m.sectionId); setNewBatch(String(m.batchNumber)); }}
                      >Change batch</button>
                    )}
                    {m.sectionId === activeSectionId ? (
                      <span className="eyebrow text-go">Active</span>
                    ) : (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { switchSection(m.sectionId); navigate("/"); }}
                      >Switch</button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {/* ── Mode tabs ── */}
      <div className="section-tabs">
        <button
          className={`section-tabs__btn${mode === "join" ? " section-tabs__btn--active" : ""}`}
          onClick={() => setMode("join")}
        >Join with code</button>
        <button
          className={`section-tabs__btn${mode === "create" ? " section-tabs__btn--active" : ""}`}
          onClick={() => setMode("create")}
        >Create a new class</button>
      </div>

      {/* ── Join form ── */}
      {mode === "join" && (
        <form className="surface" onSubmit={handleJoin}>
          <div className="field">
            <label htmlFor="joinCode">Join code</label>
            <input
              id="joinCode" value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. 7K2QXP" required
              style={{ textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div className="field">
            <label htmlFor="batchNumber">Your lab batch</label>
            <select id="batchNumber" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)}>
              {[1,2,3,4].map((b) => <option key={b} value={b}>Batch {b}</option>)}
            </select>
          </div>
          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? "Joining…" : "Join class"}
          </button>
        </form>
      )}

      {/* ── Create form ── */}
      {mode === "create" && (
        <form className="surface" onSubmit={handleCreate}>
          <div className="sections-create__row">
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="branch">Branch</label>
              <select id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} required>
                <option value="">Select branch</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <label htmlFor="year">Year</label>
              <select id="year" value={year} onChange={(e) => setYear(e.target.value)} required>
                <option value="">Select year</option>
                {YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
          </div>

          {branch && year && (
            <div className="sections-create__preview surface--raised">
              <div className="eyebrow" style={{ marginBottom: 8 }}>This will create</div>
              <div className="sections-create__preview-name">
                {branch} {YEARS.find((y) => y.value === year)?.label}
              </div>
              <p style={{ fontSize: "0.82rem", marginTop: 4 }}>
                Only one class can exist per branch and year. If this class already exists, join it with the join code instead.
              </p>
            </div>
          )}

          <div className="field">
            <label htmlFor="institutionName">Institution name (optional)</label>
            <input
              id="institutionName" value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="e.g. ABC Institute of Technology"
            />
          </div>

          <p className="text-ghost" style={{ fontSize: "0.82rem", marginBottom: 16 }}>
            You'll become the Class Representative (CR) and get a join code to share.
          </p>
          <button className="btn btn--primary" type="submit" disabled={submitting || !branch || !year}>
            {submitting ? "Creating…" : "Create class"}
          </button>
        </form>
      )}
    </div>
  );
}
