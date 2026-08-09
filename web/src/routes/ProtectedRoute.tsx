import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppNav from "../components/AppNav";

export default function ProtectedRoute() {
  const { username, loading } = useAuth();

  if (loading) {
    return null;
  }
  if (!username) {
    return <Navigate to="/login" replace />;
  }
  // min-h-0 lets the jobs table scroll inside the flex child instead of stretching the page.
  return (
    <div className="flex h-screen flex-col">
      <AppNav />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
