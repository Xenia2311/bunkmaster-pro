import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getDayAttendance, markAttendance, bulkMarkAttendance, getMembers } from "../api/attendance";
import { getTimetable } from "../api/timetable";
import { listCancellations } from "../api/cancellations";
import { todayISO, formatFriendlyDate, shiftDate, timetableDayOfWeek, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Today.css";

const STATUS_META = {
  attended:         { label: "Attended",  cls: "today__badge--go"     },
  missed:           { label: "Missed",    cls: "today__badge--signal"  },
  cancelled:        { label: "Cancelled", cls: "today__badge--caution" },
  not_yet_occurred: { label: "Upcoming",  cls: "today__badge--ghost"   },
};

function surname(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    if (a.rollNumber !== null && b.rollNumber !== null) return a.rollNumber - b.rollNumber;
    if (a.rollNumber !== null) return -1;
    if (b.rollNumber !== null) return 1;
    return surname(a.name).localeCompare(surname(b.name));
  });
}

export default function Today() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const today = todayISO();
  const [date, setDate]       = useState(today);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // CR mode
  const [crMode, setCrMode]       = useState(false);
  const [members, setMembers]     = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [cancelled, setCancelled] = useState([]);
  // bulkState: { [userId-slotId]: "attended"|"missed" }
  const [bulkState, setBulkState] = useState({});
  const [saving, setSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const data = await getDayAttendance(activeSectionId, date);
      setRecords(data.records);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId, date]);

  useEffect(() => { load(); }, [load]);

  // Load CR data when switching to CR mode or changing date
  useEffect(() => {
    if (!crMode || !activeSectionId) return;
    Promise.all([
      getMembers(activeSectionId, { full: false }),
      getTimetable(activeSectionId),
      listCancellations(activeSectionId, { from: date, to: date }),
    ]).then(([m, tt, c]) => {
      const sorted = sortMembers(m.members);
      setMembers(sorted);
      setTimetable(tt.timetable);
      setCancelled(c.cancellations || []);
      // FIX: pre-populate bulkState from existing attendance records
      // so green/red marks survive page load and post-save
      setBulkState({});
    }).catch((err) => setError(err.message));
  }, [crMode, activeSectionId, date]);

  const dayOfWeek = timetableDayOfWeek(date);
  const cancelledSlotIds = new Set(cancelled.map((c) => c.timetableSlot?.id).filter(Boolean));

  // Only show slots that have a subject AND aren't cancelled
  const daySlots = timetable.filter((s) =>
    s.dayOfWeek === dayOfWeek &&
    !s.isBreak &&
    s.subject &&
    !cancelledSlotIds.has(s.id)
  );

  async function handleMark(recordId, status) {
    setUpdatingId(recordId); setError(null);
    try {
      await markAttendance(activeSectionId, recordId, status);
      setRecords((prev) => prev.map((r) => r.id === recordId ? { ...r, status } : r));
    } catch (err) { setError(err.message); }
    finally { setUpdatingId(null); }
  }

  async function handleBulkSave() {
    setSaving(true); setError(null); setSaveSuccess(false);
    try {
      const entries = [];
      for (const slot of daySlots) {
        for (const member of members) {
          const key    = `${member.userId}-${slot.id}`;
          const status = bulkState[key];
          if (status) {
            entries.push({
              userId:          member.userId,
              subjectId:       slot.subject.id,
              timetableSlotId: slot.id,
              status,
            });
          }
        }
      }
      if (!entries.length) { setSaving(false); return; }
      await bulkMarkAttendance(activeSectionId, { date, entries });
      // FIX: do NOT clear bulkState — keep the marks visible
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      // Reload student view quietly in background
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function markAllSlot(slotId, status) {
    const updates = {};
    for (const m of members) updates[`${m.userId}-${slotId}`] = status;
    setBulkState((prev) => ({ ...prev, ...updates }));
  }

  function copyFromPreviousSlot(slotId) {
    const currentIdx = daySlots.findIndex((s) => s.id === slotId);
    if (currentIdx <= 0) return;
    const prevSlot = daySlots[currentIdx - 1];
    const updates  = {};
    for (const m of members) {
      const prevVal = bulkState[`${m.userId}-${prevSlot.id}`];
      if (prevVal) updates[`${m.userId}-${slotId}`] = prevVal;
    }
    setBulkState((prev) => ({ ...prev, ...updates }));
  }

  function handleShift(n) {
    const newDate = shiftDate(date, n);
    if (newDate > today) return;
    setDate(newDate);
    setBulkState({});
    setSaveSuccess(false);
  }

  const isToday = date === today;

  return (
    <div className="app-shell">
      <div className="today-header">
        <div>
          <div className="eyebrow">Daily check-in</div>
          <h1 className="today-header__date">{formatFriendlyDate(date)}</h1>
        </div>
        <div className="today-header__controls">
          <button className="btn btn--ghost btn--sm" onClick={() => handleShift(-1)}>← Prev</button>
          {!isToday && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setDate(today); setBulkState({}); }}>
              Today
            </button>
          )}
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => handleShift(1)}
            disabled={isToday}
            style={{ opacity: isToday ? 0.35 : 1, cursor: isToday ? "not-allowed" : "pointer" }}
          >Next →</button>
          {isClassAdmin && (
            <button
              className={`btn btn--sm ${crMode ? "btn--caution" : "btn--primary"}`}
              onClick={() => { setCrMode((v) => !v); setBulkState({}); setSaveSuccess(false); }}
            >
              {crMode ? "Student view" : "Take attendance (CR)"}
            </button>
          )}
        </div>
      </div>

      {error       && <div className="error-banner">{error}</div>}
      {saveSuccess && <div className="success-banner">Attendance saved.</div>}

      {/* ── Student view ── */}
      {!crMode && (
        loading ? <p className="text-ghost">Loading schedule…</p> :
        records.length === 0 ? (
          <div className="surface today-empty">
            <h3>No classes scheduled</h3>
            <p>It's a weekend, holiday, or nothing's on the timetable for this day.</p>
          </div>
        ) : (
          <div className="today-list">
            {records.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.not_yet_occurred;
              // CR can always edit; students are read-only if CR has marked it
              const isReadOnly = !isClassAdmin && (r.status === "cancelled" || r.markedByCR);
              return (
                <div key={r.id} className="surface--raised today-row">
                  <div className="today-row__left">
                    <div className="today-row__subject">{r.subject.name}</div>
                    <div className="eyebrow today-row__slot">
                      {r.slotIndex !== null ? TIME_SLOTS[r.slotIndex] : "—"}
                      {r.markedByCR && <span className="today__cr-badge">CR</span>}
                    </div>
                  </div>
                  <div className="today-row__right">
                    {isReadOnly || r.status === "cancelled" ? (
                      <span className={`today__badge ${meta.cls}`}>{meta.label}</span>
                    ) : (
                      <div className="today-row__btns">
                        <button
                          className={`btn btn--sm ${r.status === "attended" ? "btn--go" : "btn--ghost"}`}
                          onClick={() => handleMark(r.id, "attended")}
                          disabled={updatingId === r.id}
                        >✓ Attended</button>
                        <button
                          className={`btn btn--sm ${r.status === "missed" ? "btn--primary" : "btn--ghost"}`}
                          onClick={() => handleMark(r.id, "missed")}
                          disabled={updatingId === r.id}
                        >✗ Missed</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── CR bulk attendance ── */}
      {crMode && (
        <div className="cr-attendance">
          {dayOfWeek === null ? (
            <div className="surface today-empty"><h3>Weekend</h3><p>No classes on weekends.</p></div>
          ) : daySlots.length === 0 ? (
            <div className="surface today-empty">
              <h3>No lectures today</h3>
              <p>
                {cancelledSlotIds.size > 0
                  ? `${cancelledSlotIds.size} slot(s) cancelled — nothing left to mark.`
                  : "Nothing scheduled in the timetable for this day."}
              </p>
            </div>
          ) : (
            <>
              <div className="cr-attendance__header">
                <p className="text-ghost" style={{ fontSize: "0.85rem" }}>
                  Sorted by roll number, then surname.
                  {cancelledSlotIds.size > 0 && ` ${cancelledSlotIds.size} cancelled slot(s) hidden.`}
                </p>
                <button
                  className={`btn ${saveSuccess ? "btn--go" : "btn--primary"}`}
                  onClick={handleBulkSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : saveSuccess ? "✓ Saved!" : "Save attendance"}
                </button>
              </div>

              {daySlots.map((slot, slotIdx) => (
                <div key={slot.id} className="surface cr-slot">
                  <div className="cr-slot__header">
                    <div>
                      <div className="cr-slot__subject">{slot.subject.name}</div>
                      <div className="eyebrow">{TIME_SLOTS[slot.slotIndex]}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {slotIdx > 0 && (
                        <button className="btn btn--sm btn--ghost"
                          onClick={() => copyFromPreviousSlot(slot.id)}>
                          ↑ Same as previous
                        </button>
                      )}
                      <button className="btn btn--sm btn--go"
                        onClick={() => markAllSlot(slot.id, "attended")}>All present</button>
                      <button className="btn btn--sm btn--primary"
                        onClick={() => markAllSlot(slot.id, "missed")}>All absent</button>
                    </div>
                  </div>
                  <div className="cr-slot__members">
                    {members.map((m) => {
                      const key = `${m.userId}-${slot.id}`;
                      const val = bulkState[key] || "";
                      return (
                        <div key={m.userId}
                          className={`cr-member ${val === "attended" ? "cr-member--present" : val === "missed" ? "cr-member--absent" : ""}`}>
                          <div className="cr-member__roll mono">
                            {m.rollNumber ? `#${m.rollNumber}` : "—"}
                          </div>
                          <div className="cr-member__name">{m.name}</div>
                          <div className="cr-member__btns">
                            <button
                              className={`btn btn--sm ${val === "attended" ? "btn--go" : "btn--ghost"}`}
                              onClick={() => setBulkState((p) => ({ ...p, [key]: "attended" }))}
                            >P</button>
                            <button
                              className={`btn btn--sm ${val === "missed" ? "btn--primary" : "btn--ghost"}`}
                              onClick={() => setBulkState((p) => ({ ...p, [key]: "missed" }))}
                            >A</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
