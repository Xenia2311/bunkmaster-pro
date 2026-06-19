import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getMembers, getReport } from "../api/attendance";
import "../styles/page.css";
import "./Members.css";

const ROLE_META = {
  cr:      { label: "CR",      cls: "role-badge--signal"  },
  sr:      { label: "SR",      cls: "role-badge--caution" },
  student: { label: "Student", cls: "role-badge--ghost"   },
};

export default function Members() {
  const { activeSectionId, isClassAdmin } = useAuth();

  const [tab, setTab]         = useState("directory"); // "directory" | "report"
  const [members, setMembers] = useState([]);
  const [report, setReport]   = useState(null);
  const [target, setTarget]   = useState(75);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadDirectory = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const data = await getMembers(activeSectionId, { full: isClassAdmin });
      setMembers(data.members);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId, isClassAdmin]);

  const loadReport = useCallback(async () => {
    if (!activeSectionId || !isClassAdmin) return;
    setLoading(true); setError(null);
    try {
      const data = await getReport(activeSectionId, target);
      setReport(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId, target, isClassAdmin]);

  useEffect(() => {
    if (tab === "directory") loadDirectory();
    else loadReport();
  }, [tab, loadDirectory, loadReport]);

  return (
    <div className="app-shell">
      <div className="page-hd">
        <div>
          <div className="eyebrow">Section</div>
          <h1>Members</h1>
          <p>Who's in the class and how they're tracking.</p>
        </div>
        {isClassAdmin && (
          <div className="members-tabs">
            <button
              className={`members-tabs__btn${tab === "directory" ? " members-tabs__btn--active" : ""}`}
              onClick={() => setTab("directory")}
            >Directory</button>
            <button
              className={`members-tabs__btn${tab === "report" ? " members-tabs__btn--active" : ""}`}
              onClick={() => setTab("report")}
            >Attendance report</button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Directory ── */}
      {tab === "directory" && (
        loading ? <p className="text-ghost">Loading…</p> : (
          <div className="members-grid">
            {members.map((m) => {
              const roleMeta = ROLE_META[m.role] || ROLE_META.student;
              const pct = m.overall?.percentage;
              return (
                <div key={m.userId} className="surface member-card">
                  <div className="member-card__top">
                    <div className="member-card__avatar">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="member-card__info">
                      <div className="member-card__name">{m.name}</div>
                      <div className="member-card__email eyebrow">{m.email}</div>
                    </div>
                  </div>
                  <div className="member-card__footer">
                    <span className={`role-badge ${roleMeta.cls}`}>{roleMeta.label}</span>
                    <span className="eyebrow">Batch {m.batchNumber}</span>
                    {pct !== null && pct !== undefined && (
                      <span className={`stat-pill ${pct >= target ? "stat-pill--go" : "stat-pill--signal"}`}>
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Attendance report (CR/SR only) ── */}
      {tab === "report" && isClassAdmin && (
        <div className="report-section">
          <div className="report-controls">
            <div className="field" style={{ marginBottom: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <label style={{ whiteSpace: "nowrap" }}>Target %</label>
              <input
                type="number" min="0" max="100" value={target}
                onChange={(e) => setTarget(Number(e.target.value) || 0)}
                style={{ width: 72 }}
              />
            </div>
            <button className="btn btn--ghost btn--sm" onClick={loadReport} disabled={loading}>
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-ghost">Building report…</p>
          ) : !report ? null : (
            <div className="report-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="report-table__th report-table__th--name">Student</th>
                    <th className="report-table__th">Overall</th>
                    {report.subjects.map((s) => (
                      <th key={s.id} className="report-table__th">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.userId} className="report-table__row">
                      <td className="report-table__td report-table__td--name">
                        <div className="report-name">{row.name}</div>
                        <div className="eyebrow report-role">{ROLE_META[row.role]?.label} · B{row.batchNumber}</div>
                      </td>
                      <td className="report-table__td">
                        <PctCell pct={row.overall.percentage} target={target} />
                      </td>
                      {row.subjects.map((s) => (
                        <td key={s.subjectId} className="report-table__td">
                          <PctCell pct={s.percentage} target={target} atRisk={s.atRisk} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PctCell({ pct, target, atRisk }) {
  if (pct === null || pct === undefined) {
    return <span className="eyebrow text-ghost">—</span>;
  }
  const cls = atRisk ?? (pct < target)
    ? "stat-pill--signal"
    : pct >= target + 10
      ? "stat-pill--go"
      : "stat-pill--caution";
  return <span className={`stat-pill ${cls}`}>{pct}%</span>;
}
