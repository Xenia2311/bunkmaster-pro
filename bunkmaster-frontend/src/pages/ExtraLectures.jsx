import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listExtraLectures, createExtraLecture, deleteExtraLecture } from "../api/extraLectures";
import { getMembers } from "../api/attendance";
import { listSubjects } from "../api/subjects";
import { todayISO, formatFriendlyDate } from "../utils/dates";
import "../styles/page.css";
import "./ExtraLectures.css";

export default function ExtraLectures() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const [extras, setExtras]     = useState([]);
  const [members, setMembers]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const [e, m, s] = await Promise.all([
        listExtraLectures(activeSectionId),
        getMembers(activeSectionId, { full: false }),
        listSubjects(activeSectionId),
      ]);
      setExtras(e.extraLectures);
      setMembers(m.members);
      setSubjects(s.subjects);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this extra lecture and its attendance records?")) return;
    try {
      await deleteExtraLecture(activeSectionId, id);
      setExtras((p) => p.filter((e) => e.id !== id));
    } catch (err) { setError(err.message); }
  }

  if (!isClassAdmin) {
    return (
      <div className="app-shell">
        <div className="surface" style={{ textAlign: "center", padding: 48 }}>
          <h2>CR/SR only</h2>
          <p>Only Class Representatives and Student Representatives can manage extra lectures.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="el-header">
        <div>
          <div className="eyebrow">Attendance</div>
          <h1>Extra Lectures</h1>
          <p>Log lectures held on holidays or weekends and take attendance immediately.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Log extra lecture"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <ExtraLectureForm
          sectionId={activeSectionId}
          members={members}
          subjects={subjects}
          onSaved={(e) => { setExtras((p) => [e, ...p]); setShowForm(false); }}
          onError={setError}
        />
      )}

      {loading ? (
        <p className="text-ghost">Loading…</p>
      ) : extras.length === 0 ? (
        <div className="surface el-empty">
          <h3>No extra lectures yet</h3>
          <p>Use the button above when a lecture happens on a holiday or weekend.</p>
        </div>
      ) : (
        <div className="el-list">
          {extras.map((e) => (
            <div key={e.id} className="surface el-card">
              <div className="el-card__left">
                <div className="el-card__subject">{e.subject.name}</div>
                <div className="eyebrow">{formatFriendlyDate(e.date.slice(0, 10))}</div>
                {e.reason && <p className="el-card__reason">"{e.reason}"</p>}
                <div className="eyebrow" style={{ marginTop: 4 }}>
                  Logged by {e.createdBy.name}
                </div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(e.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtraLectureForm({ sectionId, members, subjects, onSaved, onError }) {
  const [date, setDate]         = useState(todayISO());
  const [subjectId, setSubjectId] = useState("");
  const [reason, setReason]     = useState("");
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving]     = useState(false);

  function markAll(status) {
    const updated = {};
    members.forEach((m) => { updated[m.userId] = status; });
    setAttendance(updated);
  }

  function toggle(userId, status) {
    setAttendance((p) => ({ ...p, [userId]: status }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    onError(null);

    const entries = members.map((m) => ({
      userId: m.userId,
      status: attendance[m.userId] || "missed",
    }));

    setSaving(true);
    try {
      const res = await createExtraLecture(sectionId, {
        date, subjectId,
        reason: reason || undefined,
        attendance: entries,
      });
      onSaved(res.extraLecture);
      setDate(todayISO()); setSubjectId(""); setReason(""); setAttendance({});
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form className="surface el-form" onSubmit={handleSubmit}>
      <h3>Log extra lecture</h3>

      <div className="el-form__top">
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Subject</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Online class on holiday" />
        </div>
      </div>

      <div className="el-attendance">
        <div className="el-attendance__header">
          <div className="eyebrow">Attendance ({members.length} students)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn--sm btn--go" onClick={() => markAll("attended")}>
              All present
            </button>
            <button type="button" className="btn btn--sm btn--primary" onClick={() => markAll("missed")}>
              All absent
            </button>
          </div>
        </div>
        <div className="el-attendance__grid">
          {members.map((m) => {
            const val = attendance[m.userId] || "";
            return (
              <div key={m.userId} className="el-member">
                <div className="el-member__name">{m.name}</div>
                <div className="el-member__btns">
                  <button
                    type="button"
                    className={`btn btn--sm ${val === "attended" ? "btn--go" : "btn--ghost"}`}
                    onClick={() => toggle(m.userId, "attended")}
                  >P</button>
                  <button
                    type="button"
                    className={`btn btn--sm ${val === "missed" ? "btn--primary" : "btn--ghost"}`}
                    onClick={() => toggle(m.userId, "missed")}
                  >A</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn btn--primary" type="submit" disabled={saving || !subjectId}>
        {saving ? "Saving…" : "Save extra lecture + attendance"}
      </button>
    </form>
  );
}
