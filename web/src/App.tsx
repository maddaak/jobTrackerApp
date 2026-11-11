import { lazy } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import BoardPage from "./pages/BoardPage";
import SubmittedPage from "./pages/SubmittedPage";
import PausedPage from "./pages/PausedPage";
import ClosedPage from "./pages/ClosedPage";
import WelcomePage from "./pages/WelcomePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Loaded when first opened, so the board isn't kept waiting on the chart, calendar, and table code.
const OffersPage = lazy(() => import("./pages/OffersPage"));
const AllJobsPage = lazy(() => import("./pages/AllJobsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MetricsPage = lazy(() => import("./pages/MetricsPage"));
const ResumesPage = lazy(() => import("./pages/ResumesPage"));
const SeasonsPage = lazy(() => import("./pages/SeasonsPage"));
const SeasonSummaryPage = lazy(() => import("./pages/SeasonSummaryPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<BoardPage />} />
            <Route path="/submitted" element={<SubmittedPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/paused" element={<PausedPage />} />
            <Route path="/closed" element={<ClosedPage />} />
            {/* Not /jobs: that prefix is the API's, and only a browser navigation would reach the SPA. */}
            <Route path="/all-jobs" element={<AllJobsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/insights" element={<MetricsPage />} />
            {/* The page's old address, kept so bookmarks still land. */}
            <Route path="/metrics" element={<Navigate to="/insights" replace />} />
            <Route path="/seasons" element={<SeasonsPage />} />
            <Route path="/seasons/:id/summary" element={<SeasonSummaryPage />} />
            <Route path="/resumes" element={<ResumesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/welcome" element={<WelcomePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
