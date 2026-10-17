import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import RoleRoute from './components/RoleRoute.jsx'
import { translate } from './context/translations.js'
import './App.css'

const AuthPage = lazy(() => import('./pages/AuthPage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'))
const PosPage = lazy(() => import('./pages/PosPage.jsx'))
const StudentDetailPage = lazy(() => import('./pages/StudentDetailPage.jsx'))
const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'))

function App() {
  return (
    <Suspense fallback={<div className="auth-loading">{translate(localStorage.getItem('canteen_locale') || 'en', 'Loading...')}</div>}>
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route element={<RoleRoute allowedRoles={['super-admin']} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={['patron', 'matron']} />}>
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:studentId" element={<StudentDetailPage />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={['canteen-server']} />}>
            <Route path="/pos" element={<PosPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  )
}

export default App
