import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getTimetable, updateTimetableSlot } from "../api/timetable";
import { listSubjects } from "../api/subjects";
import { DAY_NAMES, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Timetable.css";

export default function Timetable() {
  const { activeSectionId, activeMembership, isClassAdmin } = useAuth();
  const [slots, setSlots]       = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [saved, setSaved]       = useState(false);
  const [labView, setLabView]   = useState(false);
  const [pending, setPending]   = useState({});
  const myBatch = activeMembership?.batchNumber || 1;

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const [tt, subs] = await Promise.all([
        getTimetable(activeSectionId),
        listSubjects(activeSectionId),
      ]);
      setSlots(tt.timetable);
      setSubjects(subs.subjects);
      setPending({});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId]);

  useEffect(() => { load(); }, [load]);

  function getSlot(dayOfWeek, slotIndex) {
    return slots.find((s) => s.dayOfWeek === dayOfWeek && s.slotIndex === slotIndex);
  }

  // ── Pending change helpers ──
  function setPendingKey(key, value) {
    setPending((p) => ({ ...p, [key]: value }));
  }

  function getLectureValue(dayOfWeek, slotIndex) {
    const key = `${dayOfWeek}-${slotIndex}-lecture`;
    return key in pending ? pending[key] : (getSlot(dayOfWeek, slotIndex)?.subject?.id || "");
  }

  function getLabValue(dayOfWeek, slotIndex, batchNumber) {
    const key = `${dayOfWeek}-${slotIndex}-lab-B${batchNumber}`;
    if (key in pending) return pending[key];
    return getSlot(dayOfWeek, slotIndex)?.labSlots?.find((l) => l.batchNumber === batchNumber)?.subject?.id || "";
  }

  function getLabPairValue(dayOfWeek, slotIndex, batchNumber) {
    const key = `${dayOfWeek}-${slotIndex}-labpair-B${batchNumber}`;
    if (key in pending) return pending[key];
    return getSlot(dayOfWeek, slotIndex)?.labSlots?.find((l) => l.batchNumber === batchNumber)?.isLabPair || false;
  }

  /**
   * When CR sets "2-hour lab" on slot X for batch B:
   * - slot X: isLabPair = true (the START slot)
   * - slot X+1: auto-assigned the same subject, isLabPair = false (the CONTINUATION)
   *             and locked in the UI
   * When CR unchecks it:
   * - slot X: isLabPair = false
   * - slot X+1: lab subject cleared for that batch
   */
  function handleLabPairToggle(dayOfWeek, slotIndex, batchNumber, enable) {
    const labSubjectId = getLabValue(dayOfWeek, slotIndex, batchNumber);
    setPending((p) => {
      const next = { ...p };
      // Mark first slot as pair start
      next[`${dayOfWeek}-${slotIndex}-labpair-B${batchNumber}`] = enable;
      // Auto-set or clear the next slot
      const nextSlotIndex = slotIndex + 1;
      if (enable && labSubjectId) {
        next[`${dayOfWeek}-${nextSlotIndex}-lab-B${batchNumber}`]      = labSubjectId;
        next[`${dayOfWeek}-${nextSlotIndex}-labpair-B${batchNumber}`]  = false; // continuation, not start
      } else {
        // clear next slot's lab for this batch
        next[`${dayOfWeek}-${nextSlotIndex}-lab-B${batchNumber}`]     = "";
        next[`${dayOfWeek}-${nextSlotIndex}-labpair-B${batchNumber}`] = false;
      }
      return next;
    });
  }

  /**
   * Check if this slot is the CONTINUATION of a paired lab
   * (i.e. the previous slot has isLabPair=true for this batch).
   */
  function isContinuationSlot(dayOfWeek, slotIndex, batchNumber) {
    if (slotIndex === 0) return false;
    return getLabPairValue(dayOfWeek, slotIndex - 1, batchNumber);
  }

  // ── Save all pending ──
  async function handleSaveAll() {
    if (!Object.keys(pending).length) return;
    setSaving(true); setError(null);
    try {
      const slotChanges = {};
      for (const [key, value] of Object.entries(pending)) {
        const parts      = key.split("-");
        const dayOfWeek  = Number(parts[0]);
        const slotIndex  = Number(parts[1]);
        const slotKey    = `${dayOfWeek}-${slotIndex}`;
        if (!slotChanges[slotKey]) slotChanges[slotKey] = { dayOfWeek, slotIndex, labs: {} };

        if (parts[2] === "lecture") {
          slotChanges[slotKey].subjectId = value || null;
        } else if (parts[2] === "lab") {
          const bn = Number(parts[3].replace("B", ""));
          if (!slotChanges[slotKey].labs[bn]) slotChanges[slotKey].labs[bn] = {};
          slotChanges[slotKey].labs[bn].subjectId = value || null;
        } else if (parts[2] === "labpair") {
          const bn = Number(parts[3].replace("B", ""));
          if (!slotChanges[slotKey].labs[bn]) slotChanges[slotKey].labs[bn] = {};
          slotChanges[slotKey].labs[bn].isLabPair = value;
        }
      }

      for (const change of Object.values(slotChanges)) {
        const body = {};
        if ("subjectId" in change) body.subjectId = change.subjectId;
        if (Object.keys(change.labs).length > 0) {
          body.labAssignments = Object.entries(change.labs).map(([bn, lab]) => ({
            batchNumber: Number(bn),
            ...(lab.subjectId !== undefined ? { subjectId: lab.subjectId } : {}),
            ...(lab.isLabPair !== undefined ? { isLabPair: lab.isLabPair } : {}),
          }));
        }
        await updateTimetableSlot(activeSectionId, change.dayOfWeek, change.slotIndex, body);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasPending = Object.keys(pending).length > 0;
  const pendingCount = new Set(
    Object.keys(pending).map((k) => k.split("-").slice(0,2).join("-"))
  ).size;

  return (
    <div className="app-shell">
      <div className="timetable-topbar">
        <div>
          <div className="eyebrow">Weekly schedule</div>
          <h1>Timetable</h1>
          <p>
            {isClassAdmin
              ? "Edit freely — click Save once when done. No waiting between changes."
              : `Batch ${myBatch} view. Toggle to see all batches.`}
          </p>
        </div>
        <div className="timetable-topbar__right">
          <label className="timetable__toggle">
            <input type="checkbox" checked={labView} onChange={(e) => setLabView(e.target.checked)} />
            All batches
          </label>
          {isClassAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              {hasPending && (
                <button className="btn btn--ghost btn--sm" onClick={() => setPending({})}>
                  Discard
                </button>
              )}
              <button
                className={`btn btn--sm ${saved ? "btn--go" : "btn--primary"}`}
                onClick={handleSaveAll}
                disabled={saving || !hasPending}
              >
                {saving ? "Saving…" : saved ? "✓ Saved!" : hasPending ? `Save (${pendingCount} slot${pendingCount > 1 ? "s" : ""})` : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {hasPending && (
        <div className="timetable-unsaved-banner">
          {pendingCount} slot{pendingCount > 1 ? "s" : ""} modified — click Save when you're done.
        </div>
      )}

      {loading ? <p className="text-ghost">Loading timetable…</p> : (
        <>
          <div className="timetable-scroll">
            <div className="timetable-grid">
              <div className="timetable-grid__corner" />
              {TIME_SLOTS.map((t, idx) => (
                <div key={idx} className="timetable-grid__time eyebrow">{t}</div>
              ))}

              {DAY_NAMES.map((day, dayOfWeek) => (
                <TimetableRow
                  key={day}
                  day={day}
                  dayOfWeek={dayOfWeek}
                  subjects={subjects}
                  isClassAdmin={isClassAdmin}
                  labView={labView}
                  myBatch={myBatch}
                  getLectureValue={getLectureValue}
                  getLabValue={getLabValue}
                  getLabPairValue={getLabPairValue}
                  isContinuationSlot={isContinuationSlot}
                  onLectureChange={(si, v) => setPendingKey(`${dayOfWeek}-${si}-lecture`, v)}
                  onLabChange={(si, bn, v) => setPendingKey(`${dayOfWeek}-${si}-lab-B${bn}`, v)}
                  onLabPairToggle={(si, bn, v) => handleLabPairToggle(dayOfWeek, si, bn, v)}
                />
              ))}
            </div>
          </div>

          {isClassAdmin && (
            <div className="timetable-legend">
              <span className="timetable-legend__item">
                <span className="timetable-legend__dot timetable-legend__dot--pair" />
                2h lab = assign subject to first slot only, check "2-hour lab". The next slot locks automatically.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TimetableRow({
  day, dayOfWeek, subjects, isClassAdmin, labView, myBatch,
  getLectureValue, getLabValue, getLabPairValue, isContinuationSlot,
  onLectureChange, onLabChange, onLabPairToggle,
}) {
  return (
    <>
      <div className="timetable-grid__day eyebrow">{day}</div>
      {TIME_SLOTS.map((_, slotIndex) => {
        // Determine if any batch makes this a continuation slot
        const isAnyContinuation = isClassAdmin
          ? [1,2,3,4].some((bn) => isContinuationSlot(dayOfWeek, slotIndex, bn))
          : isContinuationSlot(dayOfWeek, slotIndex, myBatch);

        const slot = { dayOfWeek, slotIndex };
        const isBreak = TIME_SLOTS[slotIndex] === "BREAK";

        if (isBreak) {
          return (
            <div key={slotIndex} className="timetable-grid__cell timetable-grid__cell--break">☕</div>
          );
        }

        const lectureVal = getLectureValue(dayOfWeek, slotIndex);

        return (
          <div key={slotIndex} className={`timetable-grid__cell ${isAnyContinuation && !labView ? "timetable-grid__cell--continuation" : ""}`}>
            {/* Lecture */}
            {isClassAdmin ? (
              <select
                value={lectureVal}
                onChange={(e) => onLectureChange(slotIndex, e.target.value)}
                className="timetable-grid__select"
              >
                <option value="">— Lecture —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <div className="timetable-grid__lecture">
                {subjects.find((s) => s.id === lectureVal)?.name || "—"}
              </div>
            )}

            {/* Labs */}
            {labView ? (
              <div className="timetable-grid__labs">
                {[1,2,3,4].map((bn) => {
                  const labVal     = getLabValue(dayOfWeek, slotIndex, bn);
                  const isPairStart = getLabPairValue(dayOfWeek, slotIndex, bn);
                  const isCont     = isContinuationSlot(dayOfWeek, slotIndex, bn);

                  if (isCont) {
                    return (
                      <div key={bn} className="timetable-grid__lab-continuation">
                        B{bn} ↑ lab continues
                      </div>
                    );
                  }

                  return (
                    <div key={bn} className="timetable-grid__lab-block">
                      {isClassAdmin ? (
                        <>
                          <select
                            value={labVal}
                            onChange={(e) => onLabChange(slotIndex, bn, e.target.value)}
                            className="timetable-grid__select timetable-grid__select--lab"
                          >
                            <option value="">B{bn}: —</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>B{bn}: {s.name}</option>
                            ))}
                          </select>
                          {labVal && slotIndex < 8 && TIME_SLOTS[slotIndex + 1] !== "BREAK" && (
                            <label className="timetable-grid__pair-label" title="2-hour lab: next slot locks automatically">
                              <input
                                type="checkbox"
                                checked={isPairStart}
                                onChange={(e) => onLabPairToggle(slotIndex, bn, e.target.checked)}
                              />
                              <span>2h lab</span>
                            </label>
                          )}
                        </>
                      ) : (
                        <div className={`timetable-grid__lab-readonly ${bn === myBatch ? "timetable-grid__lab-readonly--mine" : ""}`}>
                          B{bn}: {subjects.find((s) => s.id === labVal)?.name || "—"}
                          {isPairStart && <span className="timetable-grid__pair-badge">2h</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="timetable-grid__labs">
                {(() => {
                  const labVal      = getLabValue(dayOfWeek, slotIndex, myBatch);
                  const isPairStart = getLabPairValue(dayOfWeek, slotIndex, myBatch);
                  const isCont      = isContinuationSlot(dayOfWeek, slotIndex, myBatch);
                  if (isCont) return <div className="timetable-grid__lab-continuation">↑ lab continues</div>;
                  return (
                    <div className="timetable-grid__lab-readonly timetable-grid__lab-readonly--mine">
                      {subjects.find((s) => s.id === labVal)?.name || "—"}
                      {isPairStart && <span className="timetable-grid__pair-badge">2h</span>}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
