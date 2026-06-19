import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getStats, syncAttendance } from "../api/attendance";
import { ApiError } from "../api/client";
import SubjectTicket from "../components/SubjectTicket";
import AttendanceGauge from "../components/AttendanceGauge";
import { getQuip, getZone } from "../utils/quips";
import "../styles/page.css";
import "./Dashboard.css";

const DEFAULT_TARGET = 75;

export default function Dashboard() {
  const { activeSectionId, activeMembership, user } = useAuth();
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [stats, setStats]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStats(activeSectionId, target);
      setStats(data.stats);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /semesterStartDate/i.test(err.message)) {
        setError("Your CR/SR hasn't set a semester start date yet. Head to Admin → Section to set it.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [activeSectionId, target]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true); setError(null);
    try { await syncAttendance(activeSectionId); await load(); }
    catch (err) { setError(err.message); }
    finally { setSyncing(false); }
  }

  // Derived overall stats
  const overall = useMemo(() => {
    if (!stats.length) return { pct: 0, attended: 0, conducted: 0, safe: 0, atRisk: 0 };
    const pct = stats.reduce((a, s) => a + s.percentage, 0) / stats.length;
    const attended  = stats.reduce((a, s) => a + s.attended, 0);
    const conducted = stats.reduce((a, s) => a + s.conducted, 0);
    const safe  = stats.filter((s) => s.percentage >= target).length;
    const atRisk= stats.filter((s) => s.percentage < target && s.conducted > 0).length;
    return { pct, attended, conducted, safe, atRisk };
  }, [stats, target]);

  const zone  = getZone(overall.pct, target);
  const quip  = useMemo(() => stats.length ? getQuip(overall.pct, target) : "Add subjects to get started.", [overall.pct, target, stats.length]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <div className="dash-header">
        <div className="dash-header__left">
          <div className="dash-header__eyebrow eyebrow">Dashboard</div>
          <h1>{greeting()}{user ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p>Live attendance — derived from your timetable & check-ins, no manual tallying.</p>
        </div>
        <div className="dash-header__actions">
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: "0.65rem" }}>Target %</label>
            <input
              type="number" min="0" max="100" value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 0)}
              style={{ width: 72, padding: "6px 10px", borderRadius: "var(--r-sm)", background: "var(--ink-2)", border: "1px solid var(--line-3)", color: "var(--paper)", fontFamily: "var(--font-mono)" }}
            />
          </div>
          <button className="btn btn--ghost" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "↻ Sync"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Overview hero ── */}
      <div className={`dash-overview dash-overview--${zone}`}>
        <div className="dash-overview__text">
          <div className="dash-overview__label eyebrow">Overall attendance</div>
          <div className="dash-overview__pct">
            {overall.pct.toFixed(1)}<span style={{ fontSize: "2rem" }}>%</span>
          </div>
          <p className="dash-overview__quip">&ldquo;{quip}&rdquo;</p>
          <div className="dash-overview__target">
            <span className="stat-pill stat-pill--go">{overall.safe} safe</span>
            {overall.atRisk > 0 && (
              <span className="stat-pill stat-pill--signal">{overall.atRisk} at risk</span>
            )}
            <span className="stat-pill stat-pill--ghost">{stats.length} subjects</span>
          </div>
        </div>
        <div className="dash-overview__gauge">
          <AttendanceGauge percentage={overall.pct} target={target} size="lg" />
        </div>
      </div>

      {/* ── Mini ribbon ── */}
      {stats.length > 0 && (
        <div className="dash-ribbon">
          <div className="dash-ribbon__item">
            <div className="dash-ribbon__val text-paper">{overall.attended}</div>
            <div className="dash-ribbon__label eyebrow">Attended</div>
          </div>
          <div className="dash-ribbon__item">
            <div className="dash-ribbon__val text-paper">{overall.conducted}</div>
            <div className="dash-ribbon__label eyebrow">Conducted</div>
          </div>
          <div className="dash-ribbon__item">
            <div className="dash-ribbon__val text-go">{overall.safe}</div>
            <div className="dash-ribbon__label eyebrow">Subjects safe</div>
          </div>
          <div className="dash-ribbon__item">
            <div className={`dash-ribbon__val ${overall.atRisk > 0 ? "text-signal" : "text-ghost"}`}>{overall.atRisk}</div>
            <div className="dash-ribbon__label eyebrow">At risk</div>
          </div>
        </div>
      )}

      {/* ── Subject tickets ── */}
      {loading ? (
        <p className="text-ghost">Loading your stats…</p>
      ) : stats.length === 0 && !error ? (
        <div className="dash-empty">
          <h3>No subjects yet</h3>
          <p>Ask your CR/SR to add subjects and fill in the timetable — or head to Admin if that's you.</p>
        </div>
      ) : (
        <div className="dash-grid">
          {stats.map((s) => <SubjectTicket key={s.subjectId} stat={s} target={target} />)}
        </div>
      )}
    </div>
  );
}
