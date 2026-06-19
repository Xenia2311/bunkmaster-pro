import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./NavBar.css";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/today", label: "Today" },
  { to: "/timetable", label: "Timetable" },
  { to: "/members", label: "Members" },
  { to: "/cancellations", label: "Reschedules" },
];

export default function NavBar() {
  const { user, activeMembership, memberships, switchSection, logout, isClassAdmin } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <div className="navbar__brand" onClick={() => navigate("/")}>
          <span className="navbar__brand-mark">BM</span>
          <div>
            <div className="navbar__brand-name">BunkMaster</div>
            <div className="eyebrow navbar__brand-sub">
              {activeMembership?.section?.name || "No section"}
            </div>
          </div>
        </div>

        <nav className="navbar__links">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `navbar__link${isActive ? " navbar__link--active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
          {isClassAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `navbar__link${isActive ? " navbar__link--active" : ""}`}
            >
              Admin
            </NavLink>
          )}
        </nav>

        <div className="navbar__actions">
          {memberships.length > 1 && (
            <select
              className="navbar__section-select"
              value={activeMembership?.sectionId || ""}
              onChange={(e) => switchSection(e.target.value)}
              aria-label="Switch section"
            >
              {memberships.map((m) => (
                <option key={m.sectionId} value={m.sectionId}>
                  {m.section.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn--ghost navbar__sections-btn" onClick={() => navigate("/sections")}>
            Sections
          </button>
          <button className="btn btn--ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
