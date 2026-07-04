import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./NavBar.css";

// icon is shown in mobile bottom nav
const NAV_ITEMS = [
  { to: "/",               label: "Dashboard",  icon: "⬡"  },
  { to: "/today",          label: "Today",      icon: "☀"  },
  { to: "/notices",        label: "Notices",    icon: "📢"  },
  { to: "/timetable",      label: "Timetable",  icon: "📅"  },
  { to: "/members",        label: "Members",    icon: "👥"  },
  { to: "/cancellations",  label: "Reschedules",icon: "↺"  },
];

const CR_ITEMS = [
  { to: "/extra-lectures", label: "Extra",      icon: "➕"  },
  { to: "/admin",          label: "Admin",      icon: "⚙"  },
  { to: "/bulk-import", label: "Import", icon: "⬆" },
];

export default function NavBar() {
  const { user, activeMembership, memberships, switchSection, logout, isClassAdmin } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const allItems = isClassAdmin ? [...NAV_ITEMS, ...CR_ITEMS] : NAV_ITEMS;

  return (
    <>
      {/* ── Top bar ── */}
      <header className="navbar">
        <div className="navbar__inner">
          <div className="navbar__brand" onClick={() => navigate("/")}>
            <span className="navbar__brand-mark">BM</span>
            <div>
              <div className="navbar__brand-name">BunkMaster Pro</div>
              <div className="navbar__brand-sub eyebrow">
                {activeMembership?.section?.name || "No section"}
              </div>
            </div>
          </div>

          {/* Desktop links */}
          <nav className="navbar__links navbar__links--desktop">
            {allItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `navbar__link${isActive ? " navbar__link--active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
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
            <button className="btn btn--ghost navbar__sections-btn"
              onClick={() => navigate("/sections")}>
              Sections
            </button>
            <button className="btn btn--ghost" onClick={logout}>
              Log out
            </button>
            <button className="btn btn--ghost navbar__sections-btn"
            onClick={() => navigate("/change-password")}>
            Password
           </button>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ── */}
      <nav className="bottom-nav">
        {allItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
            }
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        ))}
        <button className="bottom-nav__item" onClick={logout}>
          <span className="bottom-nav__icon">⏻</span>
          <span className="bottom-nav__label">Logout</span>
        </button>
      </nav>
    </>
  );
}
