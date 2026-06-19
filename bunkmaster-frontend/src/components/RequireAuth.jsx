import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Wraps routes that require authentication. Redirects to /login if no
 * valid session. Shows nothing while the initial auth check is loading.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-shell" style={{ textAlign: "center", paddingTop: 80 }}>
        <p className="eyebrow">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

/**
 * Wraps routes that require the user to have at least one section.
 * Redirects to /sections if they have none.
 */
export function RequireSection() {
  const { activeSectionId, loading } = useAuth();

  if (loading) return null;

  if (!activeSectionId) {
    return <Navigate to="/sections" replace />;
  }

  return <Outlet />;
}
