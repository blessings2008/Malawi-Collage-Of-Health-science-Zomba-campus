import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import { Spinner } from './components/ui';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import StudentProfilePage from './pages/StudentProfilePage';
import CohortsPage from './pages/CohortsPage';
import DistrictsPage from './pages/DistrictsPage';
import PeriodsPage from './pages/PeriodsPage';
import AllocationEnginePage from './pages/AllocationEnginePage';
import ReportsPage from './pages/ReportsPage';
import AuditLogPage from './pages/AuditLogPage';
import UsersPage from './pages/UsersPage';

function ProtectedRoute({ children, roles }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
      <Route path="/students/:id" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
      <Route path="/cohorts" element={<ProtectedRoute><CohortsPage /></ProtectedRoute>} />
      <Route path="/districts" element={<ProtectedRoute><DistrictsPage /></ProtectedRoute>} />
      <Route path="/periods" element={<ProtectedRoute><PeriodsPage /></ProtectedRoute>} />
      <Route
        path="/allocation-engine"
        element={
          <ProtectedRoute roles={['admin', 'super_admin']}>
            <AllocationEnginePage />
          </ProtectedRoute>
        }
      />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute roles={['admin', 'super_admin']}>
            <AuditLogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute roles={['super_admin']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
