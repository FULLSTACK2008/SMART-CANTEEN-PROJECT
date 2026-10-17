import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/auth.js'

export default function RoleRoute({ allowedRoles }) {
  const { user } = useAuth()
  const hasAccess = user?.roles?.some((role) => allowedRoles.includes(role))

  return hasAccess ? <Outlet /> : <Navigate to="/dashboard" replace />
}