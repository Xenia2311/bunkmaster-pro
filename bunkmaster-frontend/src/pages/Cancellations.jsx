import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listCancellations,
  deleteCancellation,
  getRescheduleOptions,
  rescheduleCancellation,
} from "../api/cancellations";
import { formatFriendlyDate, toISODate, DAY_NAMES, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Cancellations.css";

function safeFormatDate(val) {
  if (!val) return "—";
  return formatFriendlyDate(String(val).slice(0, 10));
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function Cancellations() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [success, setSuccess]             = useState(null);
  const [optionsFor, setOptionsFor]       = useState(null);
  const [options, setOptions]             = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [actingId, setActingId]           = useState(null);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const from = toISODate(addDays(new Date(), -30));
      const to   = toISODate(addDays(new Date(),  30));
      const data = await listCancellations(activeSectionId, { from, to });
      setCancellations(data.cancellations);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId]);

  useEffect(() => { load(); }, [load]);

  async function handleUndo(cancellationId) {
    if (!window.confirm("Undo this cancellation? Attendance records will be restored.")) return;
    setActingId(cancellationId); setError(null);
    try {
      await deleteCancellation(activeSectionId, cancellationId);
      setCancellations((prev) => prev.filter((c) => c.id !== cancellationId));
      setSuccess("Cancellation undone. Attendance records restored.");
      setTimeout(() => setSuccess(null), 3000);
      if (optionsFor === cancellationId) setOptionsFor(null);
    } catch (err) { setError(err.message); }
    finally { setActingId(null); }
  }

  async function handleFindOptions(cancellationId) {
    setOptionsFor(cancellationId);
    setOptions([]);
    setOptionsLoading(true);
    setError(null);
    try {
      const data = await getRescheduleOptions(activeSectionId, cancellationId, 14);
      setOptions(data.options);
    } catch (err) { setError(err.message); }
    finally { setOptionsLoading(false); }
  }

  async function handleReschedule(cancellationId, option) {
    setActingId(cancellationId); setError(null);
    try {
      await rescheduleCancellation(activeSectionId, cancellationId, {
        date:            option.date,
        timetableSlotId: option.timetableSlotId,
      });
      setOptionsFor(null);
      setSuccess("Make-up class scheduled.");
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (err) { setError(err.message); }
    finally { setActingId(null); }
  }

  const pending  = cancellations.filter((c) => c.status === "cancelled");
  const resolved = cancellations.filter((c) => c.status === "rescheduled");

  return (
    <div className="app-shell">
      <div className="eyebrow">Cancellations &amp; reschedules</div>
      <h1 className="page-title">Make-up classes</h1>
      <p className="page-sub">
        {isClassAdmin
          ? "Cancelled lectures show up here. Find a free slot or undo a mistake."
          : "Lectures cancelled by your CR/SR, and their make-up slots."}
      </p>

      {error   && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {loading ? <p className="text-ghost">Loading…</p> : (
        <>
          {/* ── Pending ── */}
          <section className="cancellations__section">
            <h2 className="cancellations__heading">Awaiting reschedule</h2>
            {pending.length === 0 ? (
              <p className="text-ghost">Nothing cancelled right now. 🎉</p>
            ) : (
              <div className="cancellations__list">
                {pending.map((c) => (
                  <div key={c.id} className="surface cancellations__item">
                    <div className="cancellations__item-main">
                      <div className="cancellations__item-title">{c.subject.name}</div>
                      <div className="eyebrow">
                        {safeFormatDate(c.date)} · Slot {c.timetableSlot.slotIndex + 1} ({DAY_NAMES[c.timetableSlot.dayOfWeek]}) · {TIME_SLOTS[c.timetableSlot.slotIndex]}
                      </div>
                      {c.reason && <p className="cancellations__reason">"{c.reason}"</p>}
                    </div>

                    {isClassAdmin && (
                      <div className="cancellations__item-actions">
                        <button
                          className="btn btn--primary btn--sm"
                          onClick={() => optionsFor === c.id ? setOptionsFor(null) : handleFindOptions(c.id)}
                          disabled={actingId === c.id}
                        >
                          {optionsFor === c.id ? "Hide options" : "Find make-up slot"}
                        </button>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleUndo(c.id)}
                          disabled={actingId === c.id}
                          title="Undo this cancellation"
                        >
                          Undo ✕
                        </button>
                      </div>
                    )}

                    {optionsFor === c.id && (
                      <div className="cancellations__options">
                        {optionsLoading ? (
                          <p className="text-ghost">Searching the next 14 days…</p>
                        ) : options.length === 0 ? (
                          <p className="text-ghost">
                            No free slots found in the next 14 days. Try clearing a timetable slot first.
                          </p>
                        ) : (
                          <div className="cancellations__options-grid">
                            {options.map((opt) => (
                              <button
                                key={`${opt.date}-${opt.timetableSlotId}`}
                                className="cancellations__option"
                                onClick={() => handleReschedule(c.id, opt)}
                                disabled={actingId === c.id}
                              >
                                <span className="mono">{safeFormatDate(opt.date)}</span>
                                <span className="eyebrow">
                                  {DAY_NAMES[opt.dayOfWeek]} · {TIME_SLOTS[opt.slotIndex]}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Rescheduled ── */}
          <section className="cancellations__section">
            <h2 className="cancellations__heading">Rescheduled</h2>
            {resolved.length === 0 ? (
              <p className="text-ghost">No make-up classes scheduled yet.</p>
            ) : (
              <div className="cancellations__list">
                {resolved.map((c) => (
                  <div key={c.id} className="surface cancellations__item cancellations__item--resolved">
                    <div className="cancellations__item-main">
                      <div className="cancellations__item-title">{c.subject.name}</div>
                      <div className="eyebrow">
                        Was {safeFormatDate(c.date)} →
                        now <span className="text-go">{safeFormatDate(c.rescheduledDate)}</span>
                      </div>
                    </div>
                    <span className="cancellations__badge">Rescheduled</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
