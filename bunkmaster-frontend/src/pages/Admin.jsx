import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getSection, updateSection } from "../api/sections";
import { createSubject, deleteSubject, listSubjects, updateSubject } from "../api/subjects";
import { addHoliday, deleteHoliday, listHolidays } from "../api/holidays";
import { getTimetable } from "../api/timetable";
import { createCancellation } from "../api/cancellations";
import { updateMember } from "../api/sections";
import { todayISO, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Admin.css";

export default function Admin() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const [section, setSection]   = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const [sec, subs, hols, tt] = await Promise.all([
        getSection(activeSectionId),
        listSubjects(activeSectionId),
        listHolidays(activeSectionId),
        getTimetable(activeSectionId),
      ]);
      setSection(sec.section);
      setSubjects(subs.subjects);
      setHolidays(hols.holidays);
      setTimetable(tt.timetable);
      setMembers(sec.members || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId]);

  useEffect(() => { load(); }, [load]);

  function flash(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  if (!isClassAdmin) {
    return (
      <div className="app-shell">
        <div className="surface" style={{ textAlign: "center", padding: 48 }}>
          <h2>CR/SR only</h2>
          <p>This page is for Class Representatives and Student Representatives.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="eyebrow">Admin</div>
      <h1 className="page-title">Class controls</h1>
      <p className="page-sub">Manage subjects, semester window, holidays, cancellations and member batches.</p>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {loading ? <p className="text-ghost">Loading…</p> : (
        <div className="admin__grid">
          <SectionInfoCard
            section={section}
            sectionId={activeSectionId}
            onUpdated={(s) => { setSection(s); flash("Saved."); }}
            setError={setError}
          />
          <SubjectsCard
            sectionId={activeSectionId}
            subjects={subjects}
            onChange={setSubjects}
            setError={setError}
            flash={flash}
          />
          <HolidaysCard
            sectionId={activeSectionId}
            holidays={holidays}
            onChange={setHolidays}
            setError={setError}
            flash={flash}
          />
          <BatchManagerCard
            sectionId={activeSectionId}
            members={members}
            onChange={setMembers}
            setError={setError}
            flash={flash}
          />
          <CancelLectureCard
            sectionId={activeSectionId}
            timetable={timetable}
            setError={setError}
            flash={flash}
          />
        </div>
      )}
    </div>
  );
}

/* ── Section info ───────────────────────────────────────────── */
function SectionInfoCard({ section, sectionId, onUpdated, setError }) {
  const [date, setDate] = useState(
    section?.semesterStartDate ? String(section.semesterStartDate).slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await updateSection(sectionId, { semesterStartDate: date });
      onUpdated(res.section);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="surface admin__card">
      <h3>Section</h3>
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Join code: <span className="mono">{section?.joinCode}</span>
      </p>
      <form onSubmit={handleSave}>
        <div className="field">
          <label>Semester start date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <p className="text-ghost" style={{ fontSize: "0.8rem", marginBottom: 12 }}>
          Required before attendance sync and stats work.
        </p>
        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

/* ── Subjects ───────────────────────────────────────────────── */
function SubjectsCard({ sectionId, subjects, onChange, setError, flash }) {
  const [name, setName]       = useState("");
  const [semTotal, setSemTotal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await createSubject(sectionId, {
        name: name.trim(),
        semesterTotal: semTotal ? Number(semTotal) : undefined,
      });
      onChange([...subjects, res.subject]);
      setName(""); setSemTotal("");
      flash("Subject added.");
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(subjectId) {
    if (!window.confirm("Delete this subject and all its attendance records?")) return;
    setError(null);
    try {
      await deleteSubject(sectionId, subjectId);
      onChange(subjects.filter((s) => s.id !== subjectId));
    } catch (err) { setError(err.message); }
  }

  async function handleSemTotalBlur(subjectId, value) {
    setError(null);
    try {
      const res = await updateSubject(sectionId, subjectId, {
        semesterTotal: value === "" ? null : Number(value),
      });
      onChange(subjects.map((s) => s.id === subjectId ? res.subject : s));
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="surface admin__card">
      <h3>Subjects</h3>
      <div className="admin__list">
        {subjects.length === 0 && <p className="text-ghost">No subjects yet.</p>}
        {subjects.map((s) => (
          <div key={s.id} className="admin__list-row">
            <span className="admin__list-name">{s.name}</span>
            <input type="number" className="admin__inline-input" placeholder="Sem total"
              defaultValue={s.semesterTotal ?? ""}
              onBlur={(e) => handleSemTotalBlur(s.id, e.target.value)}
              title="Total lectures this semester" />
            <button className="btn btn--ghost admin__delete-btn" onClick={() => handleDelete(s.id)}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} className="admin__inline-form">
        <input placeholder="Subject name" value={name}
          onChange={(e) => setName(e.target.value)} required style={{ flex: 1 }} />
        <input type="number" placeholder="Sem total" value={semTotal}
          onChange={(e) => setSemTotal(e.target.value)} style={{ width: 90 }} />
        <button className="btn btn--primary" type="submit" disabled={submitting}>Add</button>
      </form>
    </div>
  );
}

/* ── Holidays ───────────────────────────────────────────────── */
function HolidaysCard({ sectionId, holidays, onChange, setError, flash }) {
  const [date, setDate]   = useState("");
  const [name, setName]   = useState("");
  const [type, setType]   = useState("custom");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await addHoliday(sectionId, { date, name, type });
      onChange([...holidays.filter((h) => String(h.date).slice(0,10) !== date), res.holiday]
        .sort((a, b) => String(a.date).localeCompare(String(b.date))));
      setDate(""); setName("");
      flash("Holiday added.");
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(holidayId) {
    setError(null);
    try {
      await deleteHoliday(sectionId, holidayId);
      onChange(holidays.filter((h) => h.id !== holidayId));
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="surface admin__card">
      <h3>Holiday calendar</h3>
      <div className="admin__list admin__list--scroll">
        {holidays.length === 0 && <p className="text-ghost">No holidays added.</p>}
        {holidays.map((h) => (
          <div key={h.id} className="admin__list-row">
            <span className="mono">{String(h.date).slice(0, 10)}</span>
            <span className="admin__list-name">{h.name}</span>
            <span className="eyebrow">{h.type}</span>
            <button className="btn btn--ghost admin__delete-btn" onClick={() => handleDelete(h.id)}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} className="admin__inline-form admin__inline-form--wrap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)}
          required style={{ flex: 1, minWidth: 120 }} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="national">National</option>
          <option value="college">College</option>
          <option value="custom">Custom</option>
        </select>
        <button className="btn btn--primary" type="submit" disabled={submitting}>Add</button>
      </form>
    </div>
  );
}

/* ── Batch manager ──────────────────────────────────────────── */
function BatchManagerCard({ sectionId, members, onChange, setError, flash }) {
  const [saving, setSaving] = useState(null); // userId being saved

  async function handleBatchChange(userId, batchNumber) {
    setSaving(userId); setError(null);
    try {
      await updateMember(sectionId, userId, { batchNumber: Number(batchNumber) });
      onChange(members.map((m) =>
        m.userId === userId ? { ...m, batchNumber: Number(batchNumber) } : m
      ));
      flash(`Batch updated.`);
    } catch (err) { setError(err.message); }
    finally { setSaving(null); }
  }

  return (
    <div className="surface admin__card admin__card--wide">
      <h3>Member batches</h3>
      <p className="text-ghost" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
        Assign each student to a lab batch. Batches determine which lab sessions they attend.
      </p>
      <div className="admin__batch-grid">
        {members.map((m) => (
          <div key={m.userId} className="admin__batch-row">
            <span className="admin__batch-name">{m.name}</span>
            <span className="eyebrow admin__batch-role">{m.role.toUpperCase()}</span>
            <select
              value={m.batchNumber}
              onChange={(e) => handleBatchChange(m.userId, e.target.value)}
              disabled={saving === m.userId}
              className="admin__batch-select"
            >
              {[1,2,3,4].map((b) => (
                <option key={b} value={b}>Batch {b}</option>
              ))}
            </select>
          </div>
        ))}
        {members.length === 0 && <p className="text-ghost">No members yet.</p>}
      </div>
    </div>
  );
}

/* ── Cancel lecture ─────────────────────────────────────────── */
function CancelLectureCard({ sectionId, timetable, setError, flash }) {
  const [date, setDate]               = useState(todayISO());
  const [timetableSlotId, setSlotId]  = useState("");
  const [subjectId, setSubjectId]     = useState("");
  const [reason, setReason]           = useState("");
  const [submitting, setSubmitting]   = useState(false);

  function jsDateToTimetableDay(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const jsDay = new Date(y, m - 1, d).getDay();
    if (jsDay === 0 || jsDay === 6) return null;
    return jsDay - 1;
  }

  const dayOfWeek = date ? jsDateToTimetableDay(date) : null;

  // FIX: only show slots that actually have something scheduled
  const daySlots = timetable.filter((s) => {
    if (s.dayOfWeek !== dayOfWeek || s.isBreak) return false;
    // Must have a lecture subject OR at least one lab with a subject
    const hasLecture = !!s.subject;
    const hasLab     = s.labSlots?.some((l) => !!l.subject);
    return hasLecture || hasLab;
  });

  const selectedSlot = daySlots.find((s) => s.id === timetableSlotId);

  // Build subject options from the selected slot
  const subjectOptions = selectedSlot
    ? [
        selectedSlot.subject
          ? { id: selectedSlot.subject.id, label: `${selectedSlot.subject.name} (lecture)` }
          : null,
        ...(selectedSlot.labSlots || [])
          .filter((l) => l.subject)
          .map((l) => ({ id: l.subject.id, label: `${l.subject.name} (lab B${l.batchNumber})` })),
      ].filter(Boolean)
    : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await createCancellation(sectionId, {
        date, timetableSlotId, subjectId,
        reason: reason || undefined,
      });
      flash("Lecture marked as cancelled. Find a make-up slot on the Reschedules tab.");
      setSlotId(""); setSubjectId(""); setReason("");
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="surface admin__card admin__card--wide">
      <h3>Mark a lecture cancelled</h3>
      <p className="text-ghost" style={{ fontSize: "0.85rem", marginBottom: 16 }}>
        Only slots with something scheduled are shown. Paired lab slots are cancelled automatically.
      </p>
      <form onSubmit={handleSubmit} className="admin__cancel-form">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date}
            onChange={(e) => { setDate(e.target.value); setSlotId(""); setSubjectId(""); }}
            required />
        </div>
        <div className="field">
          <label>Time slot</label>
          <select
            value={timetableSlotId}
            onChange={(e) => { setSlotId(e.target.value); setSubjectId(""); }}
            required
            disabled={dayOfWeek === null}
          >
            <option value="">
              {dayOfWeek === null ? "Weekend — no classes" : "Select a slot"}
            </option>
            {daySlots.map((s) => (
              <option key={s.id} value={s.id}>
                Slot {s.slotIndex + 1} · {TIME_SLOTS[s.slotIndex]}
                {s.subject ? ` · ${s.subject.name}` : " · Lab slot"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            required
            disabled={!selectedSlot}
          >
            <option value="">Select subject</option>
            {subjectOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Faculty on leave" />
        </div>
        <button className="btn btn--primary" type="submit"
          disabled={submitting || !subjectId}>
          {submitting ? "Marking…" : "Mark cancelled"}
        </button>
      </form>
    </div>
  );
}
