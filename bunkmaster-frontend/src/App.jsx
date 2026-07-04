import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { RequireAuth, RequireSection } from "./components/RequireAuth";
import NavBar from "./components/NavBar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Sections from "./pages/Sections";
import Dashboard from "./pages/Dashboard";
import Today from "./pages/Today";
import Timetable from "./pages/Timetable";
import Cancellations from "./pages/Cancellations";
import Members from "./pages/Members";
import NoticeBoard from "./pages/NoticeBoard";
import ExtraLectures from "./pages/ExtraLectures";
import Admin from "./pages/Admin";
import BulkImport from "./pages/BulkImport";
import ChangePassword from "./pages/ChangePassword";

export default function App() {
  const { user } = useAuth();

  return (
    <>
      <NavBar />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />

        {/* Authenticated routes */}
        <Route element={<RequireAuth />}>
          {/* Section picker - accessible even without an active section */}
          <Route path="/sections" element={<Sections />} />

          {/* Routes that require an active section */}
          <Route element={<RequireSection />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/today" element={<Today />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/members" element={<Members />} />
            <Route path="/notices" element={<NoticeBoard />} />
            <Route path="/extra-lectures" element={<ExtraLectures />} />
            <Route path="/cancellations" element={<Cancellations />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/bulk-import" element={<BulkImport />} />
            <Route path="/change-password" element={<ChangePassword />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
