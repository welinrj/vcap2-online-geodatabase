import { Routes, Route, Link, NavLink } from "react-router-dom";
import SummaryPage from "./pages/SummaryPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import IndicatorsPage from "./pages/IndicatorsPage";
import BurnPage from "./pages/BurnPage";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-vcap-blue text-white"
            : "text-gray-300 hover:bg-blue-700 hover:text-white"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <nav className="bg-blue-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-white font-bold text-lg tracking-wide">
                VCAP&nbsp;II&nbsp;|&nbsp;Fisheries&nbsp;Dashboard
              </span>
            </Link>
            <div className="flex gap-1">
              <NavItem to="/" label="Summary" />
              <NavItem to="/activities" label="Activities" />
              <NavItem to="/indicators" label="Indicators" />
              <NavItem to="/burn" label="Budget Burn" />
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<SummaryPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/indicators" element={<IndicatorsPage />} />
          <Route path="/burn" element={<BurnPage />} />
        </Routes>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="bg-blue-900 text-blue-300 text-xs text-center py-3">
        VCAP II Fisheries Component — GEF/TF &amp; LDCF — UNDP Pacific Office
      </footer>
    </div>
  );
}
