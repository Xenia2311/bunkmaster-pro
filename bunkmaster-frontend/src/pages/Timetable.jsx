import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getTimetable, updateTimetableSlot } from "../api/timetable";
import { listSubjects } from "../api/subjects";
import { DAY_NAMES, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Timetable.css";

export default function Timetable() {
  const { activeSectionId, activeMembership, isClassAdmin } = useAuth();
  const [slots, setSlots]     = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);
  const [labView, setLabView] = useState(false);

  // Pending local edits: { "day-slot-lecture": subjectId, "day-slot-lab-B1": subjectId, "day-slot-labpair-B1": true }
  const [pending, setPending] = useState({});
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

  // ── Local change handlers (no API call yet) ──
  function setLecture(dayOfWeek, slotIndex, subjectId) {
    setPending((p) => ({ ...p, [`${dayOfWeek}-${slotIndex}-lecture`]: subjectId }));
  }

  function setLab(dayOfWeek, slotIndex, batchNumber, subjectId) {
    setPending((p) => ({ ...p, [`${dayOfWeek}-${slotIndex}-lab-B${batchNumber}`]: subjectId }));
  }

  function setLabPair(dayOfWeek, slotIndex, batchNumber, isPair) {
    setPending((p) => ({ ...p, [`${dayOfWeek}-${slotIndex}-labpair-B${batchNumber}`]: isPair }));
  }

  // ── Resolve current value: pending overrides server state ──
  function getLectureValue(dayOfWeek, slotIndex) {
    const key = `${dayOfWeek}-${slotIndex}-lecture`;
    if (key in pending) return pending[key];
    return getSlot(dayOfWeek, slotIndex)?.subject?.id || "";
  }

  function getLabValue(dayOfWeek, slotIndex, batchNumber) {
    const key = `${dayOfWeek}-${slotIndex}-lab-B${batchNumber}`;
    if (key in pending) return pending[key];
    const slot = getSlot(dayOfWeek, slotIndex);
    return slot?.labSlots?.find((l) => l.batchNumber === batchNumber)?.subject?.id || "";
  }

  function getLabPairValue(dayOfWeek, slotIndex, batchNumber) {
    const key = `${dayOfWeek}-${slotIndex}-labpair-B${batchNumber}`;
    if (key in pending) return pending[key];
    const slot = getSlot(dayOfWeek, slotIndex);
    return slot?.labSlots?.find((l) => l.batchNumber === batchNumber)?.isLabPair || false;
  }

  // ── Save all pending changes ──
  async function handleSaveAll() {
    if (Object.keys(pending).length === 0) return;
    setSaving(true); setError(null);
    try {
      // Group pending changes by day-slot
      const slotChanges = {};
      for (const [key, value] of Object.entries(pending)) {
        const parts = key.split("-");
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

      // Fire API calls for each modified slot
      for (const change of Object.values(slotChanges)) {
        const body = {};
        if ("subjectId" in change) body.subjectId = change.subjectId;
        if (Object.keys(change.labs).length > 0) {
          body.labAssignments = Object.entries(change.labs).map(([bn, lab]) => ({
            batchNumber: Number(bn),
            subjectId:   lab.subjectId !== undefined ? lab.subjectId : null,
            isLabPair:   lab.isLabPair !== undefined ? lab.isLabPair : undefined,
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

  return (
    <div className="app-shell">
      <div className="timetable-topbar">
        <div>
          <div className="eyebrow">Weekly schedule</div>
          <h1>Timetable</h1>
          <p>
            {isClassAdmin
              ? "Make all your changes then click Save — no waiting between slots."
              : `Viewing Batch ${myBatch} labs. Toggle to see all batches.`}
          </p>
        </div>
        <div className="timetable-topbar__right">
          <label className="timetable__toggle">
            <input type="checkbox" checked={labView} onChange={(e) => setLabView(e.target.checked)} />
            All batches
          </label>
          {isClassAdmin && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {hasPending && (
                <button className="btn btn--ghost btn--sm" onClick={() => { setPending({}); }}>
                  Discard
                </button>
              )}
              <button
                className={`btn btn--sm ${saved ? "btn--go" : "btn--primary"}`}
                onClick={handleSaveAll}
                disabled={saving || !hasPending}
              >
                {saving ? "Saving…" : saved ? "✓ Saved!" : `Save${hasPending ? ` (${Object.keys(pending).length} changes)` : ""}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {hasPending && (
        <div className="timetable-unsaved-banner">
          You have unsaved changes — click Save when done editing.
        </div>
      )}

      {loading ? (
        <p className="text-ghost">Loading timetable…</p>
      ) : (
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
                onLectureChange={setLecture}
                onLabChange={setLab}
                onLabPairChange={setLabPair}
                getSlot={(si) => getSlot(dayOfWeek, si)}
              />
            ))}
          </div>
        </div>
      )}

      {isClassAdmin && (
        <p className="text-ghost" style={{ fontSize: "0.78rem", marginTop: 12 }}>
          💡 Lab pair = 2 consecutive slots counted as 1 attendance. Check "Pair" on the first slot for each batch.
        </p>
      )}
    </div>
  );
}

function TimetableRow({
  day, dayOfWeek, subjects, isClassAdmin, labView, myBatch,
  getLectureValue, getLabValue, getLabPairValue,
  onLectureChange, onLabChange, onLabPairChange, getSlot,
}) {
  return (
    <>
      <div className="timetable-grid__day eyebrow">{day}</div>
      {Array.from({ length: 9 }, (_, slotIndex) => {
        const slot = getSlot(slotIndex);
        if (!slot) return <div key={slotIndex} className="timetable-grid__cell timetable-grid__cell--empty" />;
        if (slot.isBreak) return (
          <div key={slotIndex} className="timetable-grid__cell timetable-grid__cell--break">☕</div>
        );

        const lectureVal = getLectureValue(dayOfWeek, slotIndex);

        return (
          <div key={slotIndex} className="timetable-grid__cell">
            {/* Lecture assignment */}
            {isClassAdmin ? (
              <select
                value={lectureVal}
                onChange={(e) => onLectureChange(dayOfWeek, slotIndex, e.target.value)}
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

            {/* Lab assignments */}
            {labView ? (
              <div className="timetable-grid__labs">
                {[1,2,3,4].map((bn) => {
                  const labVal    = getLabValue(dayOfWeek, slotIndex, bn);
                  const isPair    = getLabPairValue(dayOfWeek, slotIndex, bn);
                  return isClassAdmin ? (
                    <div key={bn} className="timetable-grid__lab-row">
                      <select
                        value={labVal}
                        onChange={(e) => onLabChange(dayOfWeek, slotIndex, bn, e.target.value)}
                        className="timetable-grid__select timetable-grid__select--lab"
                      >
                        <option value="">B{bn}: —</option>
                        {subjects.map((s) => <option key={s.id} value={s.id}>B{bn}: {s.name}</option>)}
                      </select>
                      {labVal && (
                        <label className="timetable-grid__pair-label" title="Mark as 2-hour lab (counts as 1 attendance)">
                          <input
                            type="checkbox"
                            checked={isPair}
                            onChange={(e) => onLabPairChange(dayOfWeek, slotIndex, bn, e.target.checked)}
                          />
                          <span>Pair</span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div key={bn} className={`timetable-grid__lab-readonly ${bn === myBatch ? "timetable-grid__lab-readonly--mine" : ""}`}>
                      B{bn}: {subjects.find((s) => s.id === labVal)?.name || "—"}
                      {isPair && <span className="timetable-grid__pair-badge">2h</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="timetable-grid__labs">
                {(() => {
                  const labVal = getLabValue(dayOfWeek, slotIndex, myBatch);
                  const isPair = getLabPairValue(dayOfWeek, slotIndex, myBatch);
                  return (
                    <div className="timetable-grid__lab-readonly timetable-grid__lab-readonly--mine">
                      {subjects.find((s) => s.id === labVal)?.name || "—"}
                      {isPair && <span className="timetable-grid__pair-badge">2h</span>}
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
