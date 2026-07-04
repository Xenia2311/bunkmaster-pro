import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { bulkImportMembers } from "../api/bulkImport";
import "../styles/page.css";
import "./BulkImport.css";

/**
 * Parse pasted text into member rows.
 * Accepts formats:
 *   Name, email, phone       (comma separated)
 *   Name  email  phone       (tab or multiple spaces)
 *   Name | email | phone     (pipe separated)
 */
function parseInput(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const members = [];
  const errors  = [];

  lines.forEach((line, i) => {
    // Try comma, tab, pipe as separator
    const parts = line.split(/,|\t|\|/).map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: needs 3 fields (name, email, phone) — got "${line}"`);
      return;
    }
    const [name, email, phone] = parts;
    if (!name)  { errors.push(`Line ${i + 1}: name is empty`); return; }
    if (!email.includes("@")) { errors.push(`Line ${i + 1}: "${email}" doesn't look like an email`); return; }
    if (!/^\d{8,15}$/.test(phone.replace(/[\s\-\+]/g, ""))) {
      errors.push(`Line ${i + 1}: "${phone}" doesn't look like a phone number`); return;
    }
    members.push({ name, email: email.toLowerCase(), phone: phone.replace(/[\s\-\+]/g, "") });
  });

  return { members, errors };
}

export default function BulkImport() {
  const { activeSectionId, isClassAdmin } = useAuth();
  const [text, setText]         = useState("");
  const [preview, setPreview]   = useState(null);  // { members, errors }
  const [batchNumber, setBatchNumber] = useState("1");
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  if (!isClassAdmin) {
    return (
      <div className="app-shell">
        <div className="surface" style={{ textAlign: "center", padding: 48 }}>
          <h2>CR/SR only</h2>
          <p>Only Class Representatives and Student Representatives can import members.</p>
        </div>
      </div>
    );
  }

  function handlePreview() {
    setError(null); setResult(null);
    if (!text.trim()) { setError("Paste your member list first."); return; }
    const parsed = parseInput(text);
    setPreview(parsed);
  }

  async function handleImport() {
    if (!preview || preview.members.length === 0) return;
    setLoading(true); setError(null);
    try {
      const res = await bulkImportMembers(activeSectionId, {
        members:     preview.members,
        batchNumber: Number(batchNumber),
      });
      setResult(res);
      setPreview(null);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="eyebrow">Admin</div>
      <h1 className="page-title">Import classmates</h1>
      <p className="page-sub">
        Pre-register your whole class at once. Each person gets an account with their
        phone number as the default password — they can change it anytime after logging in.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {/* ── Success result ── */}
      {result && (
        <div className="bi-result">
          <div className="bi-result__hero">
            <div className="bi-result__num text-go">{result.summary.created}</div>
            <div className="eyebrow">New accounts created</div>
          </div>
          <div className="bi-result__hero">
            <div className="bi-result__num text-caution">{result.summary.addedToSection}</div>
            <div className="eyebrow">Existing accounts added</div>
          </div>
          <div className="bi-result__hero">
            <div className="bi-result__num text-ghost">{result.summary.alreadyMember}</div>
            <div className="eyebrow">Already in class</div>
          </div>
          {result.summary.failed > 0 && (
            <div className="bi-result__hero">
              <div className="bi-result__num text-signal">{result.summary.failed}</div>
              <div className="eyebrow">Failed</div>
            </div>
          )}
        </div>
      )}

      {result?.details?.failed?.length > 0 && (
        <div className="error-banner" style={{ marginTop: 12 }}>
          Failed entries:
          {result.details.failed.map((f, i) => (
            <div key={i} className="mono" style={{ fontSize: "0.8rem", marginTop: 4 }}>
              {f.name} ({f.email}) — {f.reason}
            </div>
          ))}
        </div>
      )}

      {/* ── Paste area ── */}
      {!preview && !result && (
        <div className="surface bi-paste-card">
          <h3>Paste your class list</h3>
          <p style={{ marginBottom: 16 }}>
            One person per line. Separate fields with a comma, tab, or pipe (|).
            Format: <span className="mono">Name, email, phone</span>
          </p>

          <div className="bi-example surface--raised">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Example</div>
            <div className="mono bi-example__line">Xenia Bhardwaj, xenia@college.edu, 9876543210</div>
            <div className="mono bi-example__line">Rohan Mehta, rohan@college.edu, 9123456789</div>
            <div className="mono bi-example__line">Priya Singh, priya@college.edu, 9988776655</div>
          </div>

          <div className="field" style={{ marginTop: 20 }}>
            <label>Member list</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Name, email@example.com, 9876543210\nName 2, email2@example.com, 9876543211"}
              rows={10}
              className="bi-textarea"
            />
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>Default lab batch for all imported members</label>
            <select value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)}>
              {[1,2,3,4].map((b) => <option key={b} value={b}>Batch {b}</option>)}
            </select>
            <span className="eyebrow" style={{ marginTop: 4 }}>
              You can change individual batches later from the Members page.
            </span>
          </div>

          <button className="btn btn--primary" onClick={handlePreview} disabled={!text.trim()}>
            Preview import →
          </button>
        </div>
      )}

      {/* ── Preview table ── */}
      {preview && (
        <div className="bi-preview">
          {preview.errors.length > 0 && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              <strong>{preview.errors.length} line(s) couldn't be parsed:</strong>
              {preview.errors.map((e, i) => (
                <div key={i} style={{ fontSize: "0.82rem", marginTop: 4 }}>{e}</div>
              ))}
            </div>
          )}

          {preview.members.length > 0 ? (
            <>
              <div className="bi-preview__header">
                <h3>{preview.members.length} members ready to import</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn--ghost" onClick={() => setPreview(null)}>
                    ← Edit list
                  </button>
                  <button
                    className="btn btn--primary"
                    onClick={handleImport}
                    disabled={loading}
                  >
                    {loading ? "Importing…" : `Import ${preview.members.length} members`}
                  </button>
                </div>
              </div>

              <div className="bi-preview__scroll">
                <table className="bi-table">
                  <thead>
                    <tr>
                      <th className="bi-table__th">#</th>
                      <th className="bi-table__th">Name</th>
                      <th className="bi-table__th">Email</th>
                      <th className="bi-table__th">Phone (password)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.members.map((m, i) => (
                      <tr key={i} className="bi-table__row">
                        <td className="bi-table__td mono text-ghost">{i + 1}</td>
                        <td className="bi-table__td">{m.name}</td>
                        <td className="bi-table__td mono">{m.email}</td>
                        <td className="bi-table__td mono">
                          {"•".repeat(Math.min(m.phone.length, 6))}
                          {m.phone.slice(-4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-ghost" style={{ fontSize: "0.8rem", marginTop: 12 }}>
                Each person's phone number will be their initial password.
                They can log in at any time and change it from their profile.
              </p>
            </>
          ) : (
            <div className="surface" style={{ textAlign: "center", padding: 32 }}>
              <h3>No valid entries found</h3>
              <p>Check the format and try again.</p>
              <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={() => setPreview(null)}>
                ← Go back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
