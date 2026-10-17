import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Check, CheckCheck } from 'lucide-react'
import api from '../lib/api.js'
import { useAuth } from '../context/auth.js'
import { formatDate as formatLocalizedDate } from '../lib/formatDate.js'

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatTimestamp(value, locale, t) {
  if (!value) return t('Just now')
  return formatLocalizedDate(value, locale, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function notificationMessage(notification, t) {
  const { type, student_name: studentName } = notification.data || {}
  if (type && studentName) return `${t(type)} ${t('recorded for')} ${studentName}.`
  return t(notification.data?.message || 'Canteen account update')
}

export default function NotificationsPage() {
  const { t, user } = useAuth()
  const [date, setDate] = useState(localDate)
  const [dateChosen, setDateChosen] = useState(false)
  const [page, setPage] = useState(1)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [lastPage, setLastPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (dateChosen) return undefined

    const refreshDate = window.setInterval(() => {
      setDate(localDate())
      setPage(1)
    }, 60_000)

    return () => window.clearInterval(refreshDate)
  }, [date, dateChosen])

  useEffect(() => {
    let active = true

    api.get('/notifications', { params: { date, page } })
      .then(({ data }) => {
        if (active) {
          setNotifications(data.data || [])
          setUnread(data.unread_count || 0)
          setLastPage(data.last_page || 1)
        }
      })
      .catch((requestError) => {
        if (active) setError(t(requestError.response?.data?.message || 'Notifications could not be loaded. Try again in a moment.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [date, page, t])

  async function markRead(notificationId) {
    setBusyId(notificationId)
    setActionError('')
    try {
      await api.patch(`/notifications/${notificationId}/read`)
      const wasUnread = notifications.some((item) => item.id === notificationId && !item.read_at)
      setNotifications((current) => current.map((item) => item.id === notificationId
        ? { ...item, read_at: new Date().toISOString() }
        : item))
      if (wasUnread) setUnread((count) => Math.max(0, count - 1))
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (requestError) {
      setActionError(t(requestError.response?.data?.message || 'The notification could not be marked as read.'))
    } finally {
      setBusyId(null)
    }
  }

  async function markAllRead() {
    setBusyId('all')
    setActionError('')
    try {
      await api.patch('/notifications/read-all', { date })
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })))
      setUnread(0)
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (requestError) {
      setActionError(t(requestError.response?.data?.message || 'Notifications could not be marked as read.'))
    } finally {
      setBusyId(null)
    }
  }

  const subtitle = unread ? `${unread} ${t('unread updates')}` : t('You are all caught up.')

  function changeDate(value) {
    if (!value) return
    setLoading(true)
    setError('')
    setDate(value)
    setDateChosen(true)
    setPage(1)
  }

  function changePage(nextPage) {
    setLoading(true)
    setError('')
    setPage(nextPage)
  }

  return (
    <div className="notifications-page">
      <header className="page-heading-row">
        <div>
          <p className="eyebrow">{t('INBOX')}</p>
          <h1>{t('Notifications')}</h1>
          <p className="page-subtitle">{formatLocalizedDate(`${date}T12:00:00`, user?.locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {subtitle}</p>
        </div>
        <div className="notification-heading-actions">
          <label className="report-date notification-date"><CalendarDays size={16} /><span>{t('Choose date')}</span><input type="date" value={date} max={localDate()} onChange={(event) => changeDate(event.target.value)} aria-label={t('Notification date')} /></label>
          {unread > 0 && <button className="text-action" type="button" onClick={markAllRead} disabled={busyId === 'all'}><CheckCheck size={16} />{t(busyId === 'all' ? 'Marking...' : 'Mark all read')}</button>}
        </div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}
      <section className="notification-list" aria-label={t('Your notifications')} aria-busy={loading}>
        {loading ? (
          <div className="empty-state">{t('Loading inbox...')}</div>
        ) : notifications.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Bell size={21} /></span><strong>{t('No notifications for this date')}</strong><p>{t('Choose another date to review notifications from another day.')}</p></div>
        ) : notifications.map((notification) => (
          <article className={`notification-item${notification.read_at ? '' : ' unread'}`} key={notification.id}>
            <span className="notification-icon"><Bell size={17} /></span>
            <div className="notification-copy">
              <strong>{notificationMessage(notification, t)}</strong>
              <p>{notification.data?.type && <span className="notification-type">{t(notification.data.type)}</span>}{notification.data?.amount != null && ` · ${new Intl.NumberFormat(user?.locale === 'rw' ? 'rw-RW' : user?.locale === 'fr' ? 'fr-FR' : 'en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(notification.data.amount))}`}</p>
              <time dateTime={notification.created_at}>{formatTimestamp(notification.created_at, user?.locale, t)}</time>
            </div>
            {!notification.read_at && <button className="icon-button mark-read-button" type="button" onClick={() => markRead(notification.id)} disabled={busyId === notification.id} aria-label={t('Mark notification as read')} title={t('Mark as read')}><Check size={17} /></button>}
          </article>
        ))}
      </section>
      {lastPage > 1 && <nav className="notification-pagination" aria-label={t('Notification pages')}>
        <button className="secondary-button" type="button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)}>{t('Previous')}</button>
        <span>{t('Page')} {page} {t('of')} {lastPage}</span>
        <button className="secondary-button" type="button" disabled={page >= lastPage || loading} onClick={() => changePage(page + 1)}>{t('Next')}</button>
      </nav>}
    </div>
  )
}
