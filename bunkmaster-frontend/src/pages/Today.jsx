import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getDayAttendance, markAttendance, bulkMarkAttendance, getMembers } from "../api/attendance";
import { getTimetable } from "../api/timetable";
import { listCancellations } from "../api/cancellations";
import { listHolidays } from "../api/holidays";
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
  const { activeSectionId, isClassAdmin, activeMembership } = useAuth();
  const today = todayISO();
  const myBatch = activeMembership?.batchNumber || 1;

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
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  // bulkState key: "userId-slotId-subjectId"
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

  // Load CR data: timetable + cancellations + holiday check
  useEffect(() => {
    if (!crMode || !activeSectionId) return;
    Promise.all([
      getMembers(activeSectionId, { full: false }),
      getTimetable(activeSectionId),
      listCancellations(activeSectionId, { from: date, to: date }),
      listHolidays(activeSectionId, { from: date, to: date }),
    ]).then(([m, tt, c, h]) => {
      setMembers(sortMembers(m.members));
      setTimetable(tt.timetable);
      setCancelled(c.cancellations || []);
      const holiday = (h.holidays || []).find((hol) =>
        String(hol.date).slice(0, 10) === date
      );
      setIsHoliday(!!holiday);
      setHolidayName(holiday?.name || "");
    }).catch((err) => setError(err.message));
  }, [crMode, activeSectionId, date]);

  const dayOfWeek = timetableDayOfWeek(date);

  // Cancellation set: "slotId|subjectId" pairs — so per-subject cancellation works
  const cancelledPairs = new Set(
    cancelled.map((c) => `${c.timetableSlot?.id}|${c.subject?.id}`).filter(Boolean)
  );

  /**
   * Build effective slots for CR attendance.
   * Returns array of:
   *   { type: "lecture", slot, subject, slotMembers }
   *   { type: "lab", slot, subject, batchNumber, slotMembers, isLabPair }
   *
   * Rules:
   * - Skip holidays
   * - Skip break slots
   * - Skip cancelled slot+subject pairs
   * - Skip lab continuation slots (2h pair second slot)
   * - Labs show only students of that batch
   */
  function buildEffectiveSlots() {
    if (isHoliday || dayOfWeek === null) return [];

    const daySlots = timetable
      .filter((s) => s.dayOfWeek === dayOfWeek && !s.isBreak)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    const result = [];
    const continuationKeys = new Set(); // "slotIndex-batchNumber"

    for (const slot of daySlots) {
      // Lecture
      if (slot.subject) {
        const pair = `${slot.id}|${slot.subject.id}`;
        if (!cancelledPairs.has(pair)) {
          result.push({
            type:        "lecture",
            slot,
            subject:     slot.subject,
            slotMembers: members,
          });
        }
      }

      // Labs — one entry per batch that has a subject assigned
      if (slot.labSlots && slot.labSlots.length > 0) {
        for (const labSlot of slot.labSlots.sort((a, b) => a.batchNumber - b.batchNumber)) {
          if (!labSlot.subject) continue;

          const contKey = `${slot.slotIndex}-${labSlot.batchNumber}`;
          if (continuationKeys.has(contKey)) continue; // skip continuation

          const pair = `${slot.id}|${labSlot.subject.id}`;
          if (cancelledPairs.has(pair)) continue;

          const batchMembers = members.filter((m) => m.batchNumber === labSlot.batchNumber);

          result.push({
            type:        "lab",
            slot,
            subject:     labSlot.subject,
            batchNumber: labSlot.batchNumber,
            slotMembers: batchMembers,
            isLabPair:   labSlot.isLabPair,
          });

          // Mark next slot as continuation for this batch if pair start
          if (labSlot.isLabPair) {
            continuationKeys.add(`${slot.slotIndex + 1}-${labSlot.batchNumber}`);
          }
        }
      }
    }

    return result;
  }

  const effectiveSlots = crMode ? buildEffectiveSlots() : [];

  // Slot key includes subjectId to avoid collisions between lecture + lab in same slot
  const slotKey = (userId, slotId, subjectId) => `${userId}-${slotId}-${subjectId}`;

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
      for (const es of effectiveSlots) {
        for (const member of es.slotMembers) {
          const key    = slotKey(member.userId, es.slot.id, es.subject.id);
          const status = bulkState[key];
          if (status) {
            entries.push({
              userId:          member.userId,
              subjectId:       es.subject.id,
              timetableSlotId: es.slot.id,
              status,
            });
          }
        }
      }
      if (!entries.length) { setSaving(false); return; }
      await bulkMarkAttendance(activeSectionId, { date, entries });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function markAllForSlot(es, status) {
    const updates = {};
    for (const m of es.slotMembers) {
      updates[slotKey(m.userId, es.slot.id, es.subject.id)] = status;
    }
    setBulkState((prev) => ({ ...prev, ...updates }));
  }

  function copyFromPreviousSlot(idx) {
    if (idx <= 0) return;
    const prevEs = effectiveSlots[idx - 1];
    const currEs = effectiveSlots[idx];
    const updates = {};
    for (const m of currEs.slotMembers) {
      const prevVal = bulkState[slotKey(m.userId, prevEs.slot.id, prevEs.subject.id)];
      if (prevVal) updates[slotKey(m.userId, currEs.slot.id, currEs.subject.id)] = prevVal;
    }
    setBulkState((prev) => ({ ...prev, ...updates }));
  }

  function handleShift(n) {
    const newDate = shiftDate(date, n);
    if (newDate > today) return;
    setDate(newDate);
    setBulkState({});
    setSaveSuccess(false);
    setIsHoliday(false);
    setHolidayName("");
  }

  const isToday = date === today;
  const cancelledCount = cancelledPairs.size;

  return (
    <div className="app-shell">
      <div className="today-header">
        <div>
          <div className="eyebrow">Daily check-in</div>
          <h1 className="today-header__date">{formatFriendlyDate(date)}</h1>
          {isHoliday && crMode && (
            <div className="today-holiday-banner">🏖️ {holidayName} — Holiday</div>
          )}
        </div>
        <div className="today-header__controls">
          <button className="btn btn--ghost btn--sm" onClick={() => handleShift(-1)}>← Prev</button>
          {!isToday && (
            <button className="btn btn--ghost btn--sm"
              onClick={() => { setDate(today); setBulkState({}); }}>
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
          {isHoliday ? (
            <div className="surface today-empty">
              <h3>🏖️ Holiday — {holidayName}</h3>
              <p>No classes to mark for this day.</p>
            </div>
          ) : dayOfWeek === null ? (
            <div className="surface today-empty"><h3>Weekend</h3><p>No classes on weekends.</p></div>
          ) : effectiveSlots.length === 0 ? (
            <div className="surface today-empty">
              <h3>No lectures to mark</h3>
              <p>
                {cancelledCount > 0
                  ? `All ${cancelledCount} slot(s) are cancelled.`
                  : "Nothing is scheduled in the timetable for this day."}
              </p>
            </div>
          ) : (
            <>
              <div className="cr-attendance__header">
                <p className="text-ghost" style={{ fontSize: "0.85rem" }}>
                  {effectiveSlots.length} slot(s) to mark. Lab slots show only that batch's students.
                  {cancelledCount > 0 && ` ${cancelledCount} cancelled slot(s) hidden.`}
                </p>
                <button
                  className={`btn ${saveSuccess ? "btn--go" : "btn--primary"}`}
                  onClick={handleBulkSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : saveSuccess ? "✓ Saved!" : "Save attendance"}
                </button>
              </div>

              {effectiveSlots.map((es, idx) => (
                <div key={`${es.slot.id}-${es.subject.id}-${es.batchNumber || "lec"}`}
                  className="surface cr-slot">
                  <div className="cr-slot__header">
                    <div>
                      <div className="cr-slot__subject">
                        {es.subject.name}
                        {es.type === "lab" && (
                          <span className="cr-slot__batch-badge">
                            Batch {es.batchNumber}
                            {es.isLabPair && " · 2h lab"}
                          </span>
                        )}
                      </div>
                      <div className="eyebrow">{TIME_SLOTS[es.slot.slotIndex]}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {idx > 0 && (
                        <button className="btn btn--sm btn--ghost"
                          onClick={() => copyFromPreviousSlot(idx)}>
                          ↑ Same as previous
                        </button>
                      )}
                      <button className="btn btn--sm btn--go"
                        onClick={() => markAllForSlot(es, "attended")}>All present</button>
                      <button className="btn btn--sm btn--primary"
                        onClick={() => markAllForSlot(es, "missed")}>All absent</button>
                    </div>
                  </div>

                  {es.slotMembers.length === 0 ? (
                    <p className="text-ghost" style={{ fontSize: "0.85rem" }}>
                      No students in Batch {es.batchNumber} yet. Assign them in Admin → Member Batches.
                    </p>
                  ) : (
                    <div className="cr-slot__members">
                      {es.slotMembers.map((m) => {
                        const key = slotKey(m.userId, es.slot.id, es.subject.id);
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
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
