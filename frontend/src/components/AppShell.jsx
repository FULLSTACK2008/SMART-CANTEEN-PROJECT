import { useEffect, useState } from 'react'
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { Bell, LayoutDashboard, LogOut, Moon, ShieldCheck, ShoppingCart, Sun, UsersRound, Utensils, X } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth.js'
import api from '../lib/api.js'
import { formatDate } from '../lib/formatDate.js'

const roleNames = {
  'super-admin': 'Administrator',
  patron: 'Patron',
  matron: 'Matron',
  'canteen-server': 'Canteen server',
}

export default function AppShell() {
  const { user, logout, updatePreferences, changeLocale, t } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [liveUpdate, setLiveUpdate] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const navigate = useNavigate()
  const role = user?.roles?.[0]

  async function changePreference(preference) {
    setPreferenceError('')
    try {
      await updatePreferences(preference)
    } catch {
      setPreferenceError(t('Failed to save preferences.'))
    }
  }

  useEffect(() => {
    let active = true
    const refreshUnreadCount = () => {
      api.get('/notifications/unread-count')
        .then(({ data }) => { if (active) setUnreadCount(data.unread_count) })
        .catch(() => {})
    }

    refreshUnreadCount()
    window.addEventListener('canteen:notifications-changed', refreshUnreadCount)

    return () => {
      active = false
      window.removeEventListener('canteen:notifications-changed', refreshUnreadCount)
    }
  }, [])

  useEffect(() => {
    const key = import.meta.env.VITE_REVERB_APP_KEY
    const token = sessionStorage.getItem('canteen_token')
    if (!key || !token || !user?.id) return undefined

    window.Pusher = Pusher
    const echo = new Echo({
      broadcaster: 'reverb',
      key,
      wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
      wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
      wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
      forceTLS: (import.meta.env.VITE_REVERB_SCHEME || 'http') === 'https',
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      authEndpoint: '/broadcasting/auth',
      auth: { headers: { Authorization: `Bearer ${token}` } },
    })

    echo.private(`users.${user.id}`).listen('.transaction.processed', (event) => {
      setUnreadCount((count) => count + 1)
      setLiveUpdate(event.transaction)
    })

    return () => echo.disconnect()
  }, [user?.id])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink className="brand-lockup" to="/dashboard" aria-label={t('APACOPE home')}>
          <span className="brand-mark"><Utensils size={18} strokeWidth={2.2} /></span>
          <span className="brand-name">APACOPE<span>CANTEEN</span></span>
        </NavLink>

        <div className="sidebar-section-label">{t('WORKSPACE')}</div>
        <nav className="primary-nav" aria-label={t('Main navigation')}>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <LayoutDashboard size={18} /><span>{t('Overview')}</span>
          </NavLink>
          {(role === 'patron' || role === 'matron') && <NavLink to="/students" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <UsersRound size={18} /><span>{t('Students')}</span>
          </NavLink>}
          {role === 'canteen-server' && <NavLink to="/pos" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <ShoppingCart size={18} /><span>{t('Point of sale')}</span>
          </NavLink>}
          {role === 'super-admin' && <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <ShieldCheck size={18} /><span>{t('Administration')}</span>
          </NavLink>}
          <NavLink to="/notifications" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Bell size={18} /><span>{t('Notifications')}</span>
            {unreadCount > 0 && <span className="nav-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="service-status"><span className="status-dot" />{t('Account active')}</div>
          <div className="profile-row">
            <span className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{user?.name}</strong><small>{t(roleNames[role] || 'Staff')}</small></span>
            <button className="icon-button logout-button" type="button" onClick={handleLogout} disabled={loggingOut} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>APACOPE</span><span className="breadcrumb-divider">/</span><strong>{t('Operations')}</strong></div>
          <div className="topbar-right">
            <label className="preference-locale"><span className="sr-only">{t('Language')}</span><select value={user?.locale || 'en'} onChange={(event) => { changeLocale(event.target.value); changePreference({ locale: event.target.value }) }} aria-label={t('Language')}><option value="en">{t('English')}</option><option value="rw">{t('Kinyarwanda')}</option><option value="fr">{t('French')}</option></select></label>
            <button className="theme-toggle" type="button" onClick={() => changePreference({ theme: user?.theme === 'dark' ? 'light' : 'dark' })} aria-label={t(user?.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')} title={t(user?.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')}>
              {user?.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <span className="today-label">{formatDate(new Date(), user?.locale, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <NavLink className="topbar-notifications" to="/notifications" aria-label={`${t('Notifications')}${unreadCount ? `, ${unreadCount} ${t('unread updates')}` : ''}`}>
              <Bell size={18} />{unreadCount > 0 && <span className="notification-indicator" />}
            </NavLink>
          </div>
        </header>
        {preferenceError && <div className="preference-error" role="alert">{preferenceError}</div>}
        <main className="page-content"><Outlet /></main>
      </div>

      {liveUpdate && (
        <aside className="live-toast" role="status" aria-live="polite">
          <span className="status-dot" />
          <span><strong>{t('Wallet update')}</strong><small>{t(liveUpdate.type)} · {Number(liveUpdate.amount).toFixed(2)}</small></span>
          <button className="icon-button" type="button" onClick={() => setLiveUpdate(null)} aria-label={t('Dismiss update')}><X size={16} /></button>
        </aside>
      )}
    </div>
  )
}
