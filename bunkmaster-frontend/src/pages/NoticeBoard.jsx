import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from "../api/announcements";
import { todayISO, formatFriendlyDate } from "../utils/dates";
import "../styles/page.css";
import "./NoticeBoard.css";

const TYPE_META = {
  test:       { label: "Test",       emoji: "📝", cls: "notice-tag--signal"  },
  quiz:       { label: "Quiz",       emoji: "❓", cls: "notice-tag--caution" },
  assignment: { label: "Assignment", emoji: "📋", cls: "notice-tag--go"      },
  notice:     { label: "Notice",     emoji: "📢", cls: "notice-tag--ghost"   },
  holiday:    { label: "Holiday",    emoji: "🏖️", cls: "notice-tag--ghost"   },
};

const FILTERS = ["all", "test", "quiz", "assignment", "notice", "holiday"];

export default function NoticeBoard() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [filter, setFilter]   = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!activeSectionId) return;
    setLoading(true); setError(null);
    try {
      const data = await listAnnouncements(
        activeSectionId,
        filter !== "all" ? { type: filter } : {}
      );
      setAnnouncements(data.announcements);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [activeSectionId, filter]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await deleteAnnouncement(activeSectionId, id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="app-shell">
      <div className="nb-header">
        <div>
          <div className="eyebrow">Section</div>
          <h1>Notice Board</h1>
          <p>Tests, quizzes, assignments and class announcements.</p>
        </div>
        {isClassAdmin && (
          <button className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Post announcement"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Post form (CR/SR) ── */}
      {showForm && isClassAdmin && (
        <PostForm
          sectionId={activeSectionId}
          onPosted={(a) => { setAnnouncements((p) => [a, ...p]); setShowForm(false); }}
          onError={setError}
        />
      )}

      {/* ── Filter pills ── */}
      <div className="nb-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`nb-filter ${filter === f ? "nb-filter--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : TYPE_META[f].label}
          </button>
        ))}
      </div>

      {/* ── Announcements ── */}
      {loading ? (
        <p className="text-ghost">Loading…</p>
      ) : announcements.length === 0 ? (
        <div className="surface nb-empty">
          <h3>Nothing posted yet</h3>
          <p>{isClassAdmin ? "Use the button above to post an announcement." : "Your CR/SR hasn't posted anything yet."}</p>
        </div>
      ) : (
        <div className="nb-list">
          {announcements.map((a) => {
            const meta = TYPE_META[a.type] || TYPE_META.notice;
            return (
              <div key={a.id} className={`surface nb-card nb-card--${a.type}`}>
                <div className="nb-card__top">
                  <span className={`notice-tag ${meta.cls}`}>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="nb-card__date eyebrow">
                    {formatFriendlyDate(a.date.slice(0, 10))}
                  </span>
                </div>
                <h3 className="nb-card__title">{a.title}</h3>
                {a.body && <p className="nb-card__body">{a.body}</p>}
                <div className="nb-card__footer">
                  <span className="eyebrow">Posted by {a.createdBy.name}</span>
                  {isClassAdmin && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleDelete(a.id)}
                    >Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PostForm({ sectionId, onPosted, onError }) {
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [type, setType]     = useState("notice");
  const [date, setDate]     = useState(todayISO());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); onError(null);
    try {
      const res = await createAnnouncement(sectionId, { title, body: body || undefined, type, date });
      onPosted(res.announcement);
      setTitle(""); setBody(""); setType("notice"); setDate(todayISO());
    } catch (err) { onError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form className="surface nb-form" onSubmit={handleSubmit}>
      <div className="nb-form__row">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Unit Test 2 — Data Structures" required />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Details (optional)</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Syllabus, room number, instructions…" rows={3} />
      </div>
      <button className="btn btn--primary" type="submit" disabled={saving}>
        {saving ? "Posting…" : "Post announcement"}
      </button>
    </form>
  );
}
