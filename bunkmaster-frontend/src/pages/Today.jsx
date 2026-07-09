import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getDayAttendance, markAttendance, bulkMarkAttendance, getMembers } from "../api/attendance";
import { getTimetable } from "../api/timetable";
import { listCancellations } from "../api/cancellations";
import { todayISO, formatFriendlyDate, toISODate, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Today.css";

const STATUS_META = {
  attended:         { label: "Attended",  cls: "today__badge--go"     },
  missed:           { label: "Missed",    cls: "today__badge--signal"  },
  cancelled:        { label: "Cancelled", cls: "today__badge--caution" },
  not_yet_occurred: { label: "Upcoming",  cls: "today__badge--ghost"   },
};

/** Extract surname (last word of name) for sorting */
function surname(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/** Sort members: roll number first (nulls last), then surname */
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
  const [date, setDate]       = useState(todayISO());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // CR mode
  const [crMode, setCrMode]       = useState(false);
  const [members, setMembers]     = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [cancelled, setCancelled] = useState([]); // cancellations for selected date
  const [bulkState, setBulkState] = useState({});
  const [saving, setSaving]       = useState(false);

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

  // Load CR data + cancellations for the date
  useEffect(() => {
    if (!crMode || !activeSectionId) return;
    Promise.all([
      getMembers(activeSectionId, { full: false }),
      getTimetable(activeSectionId),
      listCancellations(activeSectionId, { from: date, to: date }),
    ]).then(([m, tt, c]) => {
      setMembers(sortMembers(m.members));
      setTimetable(tt.timetable);
      setCancelled(c.cancellations || []);
    }).catch((err) => setError(err.message));
  }, [crMode, activeSectionId, date]);

  const dayOfWeek = (() => {
    const d = new Date(date + "T00:00:00").getDay();
    return (d === 0 || d === 6) ? null : d - 1;
  })();

  // Filter out cancelled slots for the selected date
  const cancelledSlotIds = new Set(cancelled.map((c) => c.timetableSlot?.id).filter(Boolean));

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
    setSaving(true); setError(null);
    try {
      const entries = [];
      for (const slot of daySlots) {
        for (const member of members) {
          const key    = `${member.userId}-${slot.id}`;
          const status = bulkState[key];
          if (status) {
            entries.push({ userId: member.userId, subjectId: slot.subject.id, timetableSlotId: slot.id, status });
          }
        }
      }
      if (!entries.length) { setSaving(false); return; }
      await bulkMarkAttendance(activeSectionId, { date, entries });
      setBulkState({});
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function markAllSlot(slotId, status) {
    const updates = {};
    for (const m of members) updates[`${m.userId}-${slotId}`] = status;
    setBulkState((prev) => ({ ...prev, ...updates }));
  }

  function shiftDate(n) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + n);
    setDate(toISODate(d));
  }

  const isToday = date === todayISO();

  return (
    <div className="app-shell">
      <div className="today-header">
        <div>
          <div className="eyebrow">Daily check-in</div>
          <h1 className="today-header__date">{formatFriendlyDate(date)}</h1>
        </div>
        <div className="today-header__controls">
          <button className="btn btn--ghost btn--sm" onClick={() => shiftDate(-1)}>← Prev</button>
          {!isToday && <button className="btn btn--ghost btn--sm" onClick={() => setDate(todayISO())}>Today</button>}
          <button className="btn btn--ghost btn--sm" onClick={() => shiftDate(1)}>Next →</button>
          {isClassAdmin && (
            <button
              className={`btn btn--sm ${crMode ? "btn--caution" : "btn--primary"}`}
              onClick={() => { setCrMode((v) => !v); setBulkState({}); }}
            >
              {crMode ? "Student view" : "Take attendance (CR)"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Student self-check-in ── */}
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
              return (
                <div key={r.id} className="surface--raised today-row">
                  <div className="today-row__left">
                    <div className="today-row__subject">{r.subject.name}</div>
                    <div className="eyebrow today-row__slot">
                      {r.slotIndex !== null ? TIME_SLOTS[r.slotIndex] : "—"}
                    </div>
                  </div>
                  <div className="today-row__right">
                    {r.status === "cancelled" ? (
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
                  ? `All ${cancelledSlotIds.size} slot(s) for today are cancelled.`
                  : "Nothing scheduled in the timetable for this day."}
              </p>
            </div>
          ) : (
            <>
              <div className="cr-attendance__header">
                <p className="text-ghost" style={{ fontSize: "0.85rem" }}>
                  Sorted by roll number, then surname. {cancelledSlotIds.size > 0 && `(${cancelledSlotIds.size} cancelled slot(s) hidden.)`}
                </p>
                <button className="btn btn--primary" onClick={handleBulkSave} disabled={saving}>
                  {saving ? "Saving…" : "Save attendance"}
                </button>
              </div>

              {daySlots.map((slot) => (
                <div key={slot.id} className="surface cr-slot">
                  <div className="cr-slot__header">
                    <div>
                      <div className="cr-slot__subject">{slot.subject.name}</div>
                      <div className="eyebrow">{TIME_SLOTS[slot.slotIndex]}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn--sm btn--go" onClick={() => markAllSlot(slot.id, "attended")}>All present</button>
                      <button className="btn btn--sm btn--primary" onClick={() => markAllSlot(slot.id, "missed")}>All absent</button>
                    </div>
                  </div>
                  <div className="cr-slot__members">
                    {members.map((m) => {
                      const key = `${m.userId}-${slot.id}`;
                      const val = bulkState[key] || "";
                      return (
                        <div key={m.userId} className={`cr-member ${val === "attended" ? "cr-member--present" : val === "missed" ? "cr-member--absent" : ""}`}>
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
