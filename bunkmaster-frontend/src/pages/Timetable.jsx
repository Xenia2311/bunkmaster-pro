import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getTimetable, updateTimetableSlot } from "../api/timetable";
import { listSubjects } from "../api/subjects";
import { DAY_NAMES, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Timetable.css";

const BATCH_NUMBERS = [1, 2, 3, 4];

export default function Timetable() {
  const { activeSectionId, activeMembership, isClassAdmin } = useAuth();
  const [slots, setSlots] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [labView, setLabView] = useState(false);
  const myBatch = activeMembership?.batchNumber || 1;

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true);
    setError(null);
    try {
      const [tt, subs] = await Promise.all([
        getTimetable(activeSectionId),
        listSubjects(activeSectionId),
      ]);
      setSlots(tt.timetable);
      setSubjects(subs.subjects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeSectionId]);

  useEffect(() => {
    load();
  }, [load]);

  function getSlot(dayOfWeek, slotIndex) {
    return slots.find((s) => s.dayOfWeek === dayOfWeek && s.slotIndex === slotIndex);
  }

  async function handleLectureChange(slot, subjectId) {
    const key = `${slot.dayOfWeek}-${slot.slotIndex}-lecture`;
    setSavingKey(key);
    setError(null);
    try {
      await updateTimetableSlot(activeSectionId, slot.dayOfWeek, slot.slotIndex, {
        subjectId: subjectId || null,
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleLabChange(slot, batchNumber, subjectId) {
    const key = `${slot.dayOfWeek}-${slot.slotIndex}-lab-${batchNumber}`;
    setSavingKey(key);
    setError(null);
    try {
      await updateTimetableSlot(activeSectionId, slot.dayOfWeek, slot.slotIndex, {
        labAssignments: [{ batchNumber, subjectId: subjectId || null }],
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="timetable-topbar">
        <div>
          <div className="eyebrow">Weekly schedule</div>
          <h1>Timetable</h1>
          <p>
            {isClassAdmin
              ? "Edit lectures and lab assignments. Changes apply to the whole section."
              : `Showing lab assignments for Batch ${myBatch}. Toggle below to see all batches.`}
          </p>
        </div>
        <label className="timetable__toggle">
          <input type="checkbox" checked={labView} onChange={(e) => setLabView(e.target.checked)} />
          Show all lab batches
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="text-ghost">Loading timetable...</p>
      ) : (
        <div className="timetable-scroll">
          <div className="timetable-grid">
            <div className="timetable-grid__corner" />
            {TIME_SLOTS.map((t, idx) => (
              <div key={idx} className="timetable-grid__time eyebrow">
                {t}
              </div>
            ))}

            {DAY_NAMES.map((day, dayOfWeek) => (
              <FragmentRow
                key={day}
                day={day}
                dayOfWeek={dayOfWeek}
                getSlot={getSlot}
                subjects={subjects}
                isClassAdmin={isClassAdmin}
                labView={labView}
                myBatch={myBatch}
                savingKey={savingKey}
                onLectureChange={handleLectureChange}
                onLabChange={handleLabChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  day,
  dayOfWeek,
  getSlot,
  subjects,
  isClassAdmin,
  labView,
  myBatch,
  savingKey,
  onLectureChange,
  onLabChange,
}) {
  return (
    <>
      <div className="timetable-grid__day eyebrow">{day}</div>
      {TIME_SLOTS.map((_, slotIndex) => {
        const slot = getSlot(dayOfWeek, slotIndex);
        if (!slot) return <div key={slotIndex} className="timetable-grid__cell timetable-grid__cell--empty" />;
        if (slot.isBreak) {
          return (
            <div key={slotIndex} className="timetable-grid__cell timetable-grid__cell--break">
              <span>☕</span>
            </div>
          );
        }

        const lectureKey = `${dayOfWeek}-${slotIndex}-lecture`;

        return (
          <div key={slotIndex} className="timetable-grid__cell">
            {isClassAdmin ? (
              <select
                value={slot.subject?.id || ""}
                onChange={(e) => onLectureChange(slot, e.target.value)}
                disabled={savingKey === lectureKey}
                className="timetable-grid__select"
              >
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="timetable-grid__lecture">{slot.subject?.name || "—"}</div>
            )}

            {labView ? (
              <div className="timetable-grid__labs">
                {[1, 2, 3, 4].map((batchNumber) => {
                  const labSlot = slot.labSlots.find((l) => l.batchNumber === batchNumber);
                  const labKey = `${dayOfWeek}-${slotIndex}-lab-${batchNumber}`;
                  return isClassAdmin ? (
                    <select
                      key={batchNumber}
                      value={labSlot?.subject?.id || ""}
                      onChange={(e) => onLabChange(slot, batchNumber, e.target.value)}
                      disabled={savingKey === labKey}
                      className="timetable-grid__select timetable-grid__select--lab"
                      title={`Batch ${batchNumber}`}
                    >
                      <option value="">B{batchNumber}: —</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          B{batchNumber}: {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div key={batchNumber} className="timetable-grid__lab-readonly">
                      B{batchNumber}: {labSlot?.subject?.name || "—"}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="timetable-grid__labs">
                {(() => {
                  const myLab = slot.labSlots.find((l) => l.batchNumber === myBatch);
                  return (
                    <div className="timetable-grid__lab-readonly">
                      Lab: {myLab?.subject?.name || "—"}
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
