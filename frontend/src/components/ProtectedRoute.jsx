import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/auth.js'

export default function ProtectedRoute() {
  const { user, ready, t } = useAuth()
  if (!ready) return <main className="auth-loading" aria-live="polite">{t('Opening your workspace...')}</main>
  return user ? <Outlet /> : <Navigate to="/login" replace />
}