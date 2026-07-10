import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listCancellations,
  getRescheduleOptions,
  rescheduleCancellation,
} from "../api/cancellations";
import { formatFriendlyDate, toISODate, DAY_NAMES, TIME_SLOTS } from "../utils/dates";
import "../styles/page.css";
import "./Cancellations.css";

function safeFormatDate(val) {
  if (!val) return "—";
  // handle both "2026-06-20" and "2026-06-20T00:00:00.000Z"
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
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [optionsFor, setOptionsFor]   = useState(null);
  const [options, setOptions]         = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [actingId, setActingId]       = useState(null);

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
          ? "Cancelled lectures show up here. Find a free slot and lock in a make-up time."
          : "Lectures cancelled by your CR/SR, and their make-up slots."}
      </p>

      {error && <div className="error-banner">{error}</div>}

      {loading ? <p className="text-ghost">Loading…</p> : (
        <>
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
                        {safeFormatDate(c.date)} · Slot {c.timetableSlot.slotIndex + 1} ({DAY_NAMES[c.timetableSlot.dayOfWeek]})
                      </div>
                      {c.reason && <p className="cancellations__reason">"{c.reason}"</p>}
                    </div>

                    {isClassAdmin && (
                      <button
                        className="btn btn--primary"
                        onClick={() => handleFindOptions(c.id)}
                        disabled={actingId === c.id}
                      >Find make-up slot</button>
                    )}

                    {optionsFor === c.id && (
                      <div className="cancellations__options">
                        {optionsLoading ? (
                          <p className="text-ghost">Searching the next 14 days…</p>
                        ) : options.length === 0 ? (
                          <p className="text-ghost">
                            No free slots found in the next 14 days. Try clearing a slot in the timetable first.
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
                                  {DAY_NAMES[opt.dayOfWeek]} · Slot {opt.slotIndex + 1} · {TIME_SLOTS[opt.slotIndex]}
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
