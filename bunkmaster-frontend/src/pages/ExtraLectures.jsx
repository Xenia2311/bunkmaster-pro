import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listExtraLectures,
  createExtraLecture,
  updateExtraLectureAttendance,
  deleteExtraLecture,
} from "../api/extraLectures";
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
  const [success, setSuccess]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  // Which extra lecture's attendance is expanded
  const [expandedId, setExpandedId] = useState(null);

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
    setError(null);
    try {
      await deleteExtraLecture(activeSectionId, id);
      setExtras((prev) => prev.filter((e) => e.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) { setError(err.message); }
  }

  async function handleAttendanceEdit(extraId, recordId, status) {
    setError(null);
    try {
      await updateExtraLectureAttendance(activeSectionId, extraId, { recordId, status });
      // Update local state
      setExtras((prev) => prev.map((e) => {
        if (e.id !== extraId) return e;
        const attendance = e.attendance.map((a) =>
          a.recordId === recordId ? { ...a, status } : a
        );
        const attended = attendance.filter((a) => a.status === "attended").length;
        return {
          ...e,
          attendance,
          summary: { ...e.summary, attended, missed: attendance.filter((a) => a.status === "missed").length },
        };
      }));
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

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {showForm && (
        <ExtraLectureForm
          sectionId={activeSectionId}
          members={members}
          subjects={subjects}
          onSaved={(extra) => {
            setShowForm(false);
            setSuccess(`Extra lecture saved — ${extra.subject?.name || ""}`);
            setTimeout(() => setSuccess(null), 3000);
            load(); // reload to get full attendance data
          }}
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
              <div className="el-card__header">
                <div className="el-card__left">
                  <div className="el-card__subject">{e.subject.name}</div>
                  <div className="eyebrow">{formatFriendlyDate(String(e.date).slice(0, 10))}</div>
                  {e.reason && <p className="el-card__reason">"{e.reason}"</p>}
                  <div className="el-card__summary">
                    <span className="stat-pill stat-pill--go">{e.summary.attended} present</span>
                    <span className="stat-pill stat-pill--signal">{e.summary.missed} absent</span>
                    <span className="stat-pill stat-pill--ghost">{e.summary.total} total</span>
                  </div>
                </div>
                <div className="el-card__actions">
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    {expandedId === e.id ? "Hide attendance" : "View / Edit"}
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => handleDelete(e.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {/* ── Expanded attendance view/edit ── */}
              {expandedId === e.id && (
                <div className="el-attendance-view">
                  <div className="el-attendance-view__header eyebrow">
                    Attendance — click P/A to change
                  </div>
                  <div className="el-attendance-grid">
                    {e.attendance.map((a) => (
                      <div key={a.recordId}
                        className={`el-att-row ${a.status === "attended" ? "el-att-row--present" : "el-att-row--absent"}`}>
                        <div className="el-att-roll mono">
                          {a.rollNumber ? `#${a.rollNumber}` : "—"}
                        </div>
                        <div className="el-att-name">{a.name}</div>
                        <div className="el-att-btns">
                          <button
                            className={`btn btn--sm ${a.status === "attended" ? "btn--go" : "btn--ghost"}`}
                            onClick={() => handleAttendanceEdit(e.id, a.recordId, "attended")}
                          >P</button>
                          <button
                            className={`btn btn--sm ${a.status === "missed" ? "btn--primary" : "btn--ghost"}`}
                            onClick={() => handleAttendanceEdit(e.id, a.recordId, "missed")}
                          >A</button>
                        </div>
                      </div>
                    ))}
                    {e.attendance.length === 0 && (
                      <p className="text-ghost">No attendance records yet.</p>
                    )}
                  </div>
                </div>
              )}
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

  // Sort members by roll number then surname
  const sortedMembers = [...members].sort((a, b) => {
    if (a.rollNumber !== null && b.rollNumber !== null) return a.rollNumber - b.rollNumber;
    if (a.rollNumber !== null) return -1;
    if (b.rollNumber !== null) return 1;
    const sA = a.name.trim().split(/\s+/).pop().toLowerCase();
    const sB = b.name.trim().split(/\s+/).pop().toLowerCase();
    return sA.localeCompare(sB);
  });

  function markAll(status) {
    const updated = {};
    sortedMembers.forEach((m) => { updated[m.userId] = status; });
    setAttendance(updated);
  }

  function toggle(userId, status) {
    setAttendance((p) => ({ ...p, [userId]: status }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    onError(null);

    const entries = sortedMembers.map((m) => ({
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
      // Reset form state
      setDate(todayISO());
      setSubjectId("");
      setReason("");
      setAttendance({});
      onSaved(res.extraLecture);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const markedCount = Object.keys(attendance).length;

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
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          <div className="eyebrow">
            Attendance — {markedCount}/{sortedMembers.length} marked
          </div>
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
          {sortedMembers.map((m) => {
            const val = attendance[m.userId] || "";
            return (
              <div key={m.userId}
                className={`el-member ${val === "attended" ? "el-member--present" : val === "missed" ? "el-member--absent" : ""}`}>
                <div className="el-member__roll mono">
                  {m.rollNumber ? `#${m.rollNumber}` : "—"}
                </div>
                <div className="el-member__name">{m.name}</div>
                <div className="el-member__btns">
                  <button type="button"
                    className={`btn btn--sm ${val === "attended" ? "btn--go" : "btn--ghost"}`}
                    onClick={() => toggle(m.userId, "attended")}
                  >P</button>
                  <button type="button"
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
