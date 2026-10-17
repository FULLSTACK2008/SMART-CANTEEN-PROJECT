import { useDeferredValue, useEffect, useState } from 'react'
import { Activity, ArchiveRestore, ArrowDownRight, ArrowUpRight, Check, Clock3, RotateCcw, Search, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react'
import { useAuth } from '../context/auth.js'
import api from '../lib/api.js'
import { formatCurrency } from '../lib/currency.js'
import { formatDate as formatLocalizedDate } from '../lib/formatDate.js'
import StudentAvatar from '../components/StudentAvatar.jsx'
import LowBalanceWarning from '../components/LowBalanceWarning.jsx'
import { hasLowBalance } from '../lib/studentBalance.js'

const roleLabels = {
  'super-admin': 'Administrator',
  patron: 'Patron',
  matron: 'Matron',
  'canteen-server': 'Canteen server',
}

const assignableRoles = ['patron', 'matron', 'canteen-server']

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

function formatDate(value, locale = 'en') {
  return formatLocalizedDate(value, locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function transactionLabel(type) {
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Transaction'
}

export default function AdminPage() {
  const { user: signedInUser, t } = useAuth()
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [roleDrafts, setRoleDrafts] = useState({})
  const [managedUser, setManagedUser] = useState(null)
  const [managedStudents, setManagedStudents] = useState([])
  const [managedLoading, setManagedLoading] = useState(false)
  const [managedError, setManagedError] = useState('')
  const [managedPage, setManagedPage] = useState(1)
  const [managedPagination, setManagedPagination] = useState(null)
  const [managedRefresh, setManagedRefresh] = useState(0)
  const deferredSearch = useDeferredValue(searchText)

  useEffect(() => {
    if (!managedUser) return undefined

    let active = true
    const controller = new AbortController()

    api.get(`/admin/users/${managedUser.id}/students`, {
      params: { page: managedPage, per_page: 50 },
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (!active) return
        setManagedStudents(data.data || [])
        setManagedPagination(data.meta || null)
      })
      .catch((requestError) => {
        if (active && requestError.code !== 'ERR_CANCELED') {
          setManagedError(requestError.response?.data?.message || 'Student records for this account could not be loaded.')
        }
      })
      .finally(() => { if (active) setManagedLoading(false) })

    return () => {
      active = false
      controller.abort()
    }
  }, [managedPage, managedRefresh, managedUser])

  useEffect(() => {
    let active = true

    Promise.all([api.get('/admin/dashboard'), api.get('/admin/users')])
      .then(([overviewResponse, usersResponse]) => {
        if (!active) return
        setOverview(overviewResponse.data)
        setUsers(usersResponse.data.data || [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Administration data could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [])

  const filteredUsers = users.filter((user) => {
    const query = deferredSearch.trim().toLowerCase()
    const matchesText = !query || [user.name, user.email, user.username, ...(user.roles || [])]
      .some((value) => value?.toLowerCase().includes(query))
    const matchesRole = roleFilter === 'all' || user.roles?.includes(roleFilter)
    return matchesText && matchesRole && (statusFilter === 'all' || user.status === statusFilter)
  })

  const roleAccounts = ['patron', 'matron'].map((role) => ({
    role,
    users: users.filter((user) => user.roles?.includes(role)),
  }))

  async function runUserAction(user, action) {
    setBusyId(user.id)
    setActionError('')
    setConfirmingId(null)

    try {
      const endpoint = action === 'suspend'
        ? `/admin/users/${user.id}/suspend`
        : `/admin/users/${user.id}/approve`
      const { data } = await api.post(endpoint)
      setUsers((current) => current.map((item) => item.id === user.id ? data.data : item))

      const [overviewResponse] = await Promise.all([api.get('/admin/dashboard')])
      setOverview(overviewResponse.data)
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'This account could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  async function assignUserRole(user) {
    const role = roleDrafts[user.id] ?? user.roles?.find((item) => assignableRoles.includes(item))
    if (!role) return

    setBusyId(user.id)
    setActionError('')

    try {
      const { data } = await api.patch(`/admin/users/${user.id}/role`, { role })
      setUsers((current) => current.map((item) => item.id === user.id ? data.data : item))
      setOverview((current) => current ? {
        ...current,
        pending_users: current.pending_users?.map((item) => item.id === user.id ? data.data : item),
      } : current)
      setRoleDrafts((current) => ({ ...current, [user.id]: role }))
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'This account role could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  function toggleManagedStudents(user) {
    if (managedUser?.id === user.id) {
      setManagedUser(null)
      setManagedStudents([])
      setManagedPagination(null)
      return
    }

    setManagedUser(user)
    setManagedStudents([])
    setManagedPage(1)
    setManagedLoading(true)
    setManagedError('')
    setRoleFilter(user.roles?.includes('patron') ? 'patron' : 'matron')
  }

  async function updateManagedStudent(student, action) {
    if (action === 'permanent' && !window.confirm(t('Permanently delete this student and all of their wallet history?'))) return
    if (action === 'archive' && !window.confirm(t('Move this student to the recycle bin?'))) return
    setBusyId(`student-${student.id}`)
    setManagedError('')

    try {
      if (action === 'restore') {
        await api.patch(`/students/${student.id}/restore`)
      } else if (action === 'permanent') {
        await api.delete(`/students/${student.id}/permanent`)
      } else {
        await api.delete(`/students/${student.id}`)
      }
      setManagedLoading(true)
      setManagedRefresh((current) => current + 1)
    } catch (requestError) {
      setManagedError(requestError.response?.data?.message || 'This student could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  const metrics = overview?.metrics

  return (
    <div className="admin-page">
      <header className="admin-heading">
          <div><p className="eyebrow">{t('SUPER-ADMIN WORKSPACE')}</p><h1>{t('Administration')}</h1><p className="page-subtitle">{t('Access, enrolment and canteen activity.')}</p></div>
        <div className="admin-asof"><span className="status-dot" />{t('Live data')}</div>
      </header>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="admin-metrics" aria-label={t('System metrics')} aria-busy={loading}>
        <article className="admin-metric metric-staff"><span className="metric-icon"><UsersRound size={17} /></span><span className="metric-caption">{t('STAFF ACCOUNTS')}</span><strong>{metrics?.users_total ?? '—'}</strong><small>{metrics?.users_active ?? '—'} {t('active')} · {metrics?.users_pending ?? '—'} {t('pending')}</small></article>
        <article className="admin-metric metric-students"><span className="metric-icon"><ShieldCheck size={17} /></span><span className="metric-caption">{t('STUDENT RECORDS')}</span><strong>{metrics?.students_total ?? '—'}</strong><small>{metrics?.students_active ?? '—'} {t('active profiles')}</small></article>
        <article className="admin-metric metric-sales"><span className="metric-icon"><Activity size={17} /></span><span className="metric-caption">{t('SALES TODAY')}</span><strong>{formatCurrency(metrics?.sales_today || 0)}</strong><small>{metrics?.transactions_today ?? '—'} {t('completed transactions')}</small></article>
      </section>

      <section className="role-account-grid" aria-label={t('Patron and matron accounts')}>
        {roleAccounts.map(({ role, users: roleUsers }) => <section className="admin-panel role-account-panel" key={role}>
          <header className="admin-panel-heading"><div className="admin-panel-title"><span className="panel-icon panel-icon-green"><UsersRound size={17} /></span><div><p className="eyebrow">{t('ACCOUNT DIRECTORY')}</p><h2>{t(role === 'patron' ? 'Patrons' : 'Matrons')}</h2></div></div><span className="pending-count">{roleUsers.length}</span></header>
          {roleUsers.length === 0 ? <div className="admin-empty">{t(role === 'patron' ? 'No patron accounts.' : 'No matron accounts.')}</div> : <div className="role-account-list">{roleUsers.map((user) => <article className="role-account-row" key={user.id}>
            <span className="admin-avatar">{user.name?.trim().charAt(0).toUpperCase()}</span>
            <span className="role-account-copy"><strong>{user.name}</strong><small>{user.email}</small></span>
            <span className={`status-pill status-${user.status}`}><i />{t(user.status)}</span>
            <button className="role-manage-button" type="button" aria-expanded={managedUser?.id === user.id} onClick={() => toggleManagedStudents(user)}>{t(managedUser?.id === user.id ? 'Close' : 'Manage')}</button>
          </article>)}</div>}
        </section>)}
      </section>

      {managedUser && <section className="admin-panel managed-students-panel" aria-label={`${t('Students managed by')} ${managedUser.name}`}>
        <header className="admin-panel-heading">
          <div className="admin-panel-title"><span className="panel-icon panel-icon-green"><ArchiveRestore size={17} /></span><div><p className="eyebrow">{t(managedUser.roles?.includes('patron') ? 'PATRON RECORDS' : 'MATRON RECORDS')}</p><h2>{t('Students managed by')} {managedUser.name}</h2></div></div>
          <button className="icon-button" type="button" onClick={() => { setManagedUser(null); setManagedStudents([]); setManagedPagination(null); setManagedLoading(false) }} aria-label={t('Close')}><X size={17} /></button>
        </header>
        {managedError && <div className="form-error staff-action-error" role="alert">{t(managedError)}</div>}
        {managedLoading ? <div className="admin-empty">{t('Loading student records...')}</div> : managedStudents.length === 0 ? <div className="admin-empty">{t('No student records for this account.')}</div> : (
          <div className="managed-student-list">
            {managedStudents.map((student) => <article className="managed-student-row" key={student.id}>
              <span className="student-identity"><StudentAvatar student={student} className="student-avatar" /><span><strong className={hasLowBalance(student) ? 'low-balance-name' : ''}>{student.full_name}</strong><small>{student.student_number} · {student.class || t('Class not set')}</small></span></span>
              <strong className={`managed-student-balance${hasLowBalance(student) ? ' low-balance-amount' : ''}`}>{formatCurrency(student.balance)}{hasLowBalance(student) && <LowBalanceWarning student={student} />}</strong>
              <span className={`managed-student-status${student.deleted_at ? ' deleted' : ''}`}>{t(student.deleted_at ? 'In recycle bin' : student.is_active ? 'Active' : 'Inactive')}</span>
              <div className="managed-student-actions">
                {student.deleted_at ? <>
                  <button className="role-manage-button" type="button" onClick={() => updateManagedStudent(student, 'restore')} disabled={busyId === `student-${student.id}`}><RotateCcw size={13} />{t('Restore')}</button>
                  <button className="permanent-delete-button" type="button" onClick={() => updateManagedStudent(student, 'permanent')} disabled={busyId === `student-${student.id}`}><Trash2 size={13} />{t('Delete permanently')}</button>
                </> : <button className="permanent-delete-button archive-student-button" type="button" onClick={() => updateManagedStudent(student, 'archive')} disabled={busyId === `student-${student.id}`}><Trash2 size={13} />{t('Delete student')}</button>}
              </div>
            </article>)}
          </div>
        )}
        {managedPagination?.last_page > 1 && <nav className="directory-pagination" aria-label={t('Student pages')}>
          <button className="secondary-button" type="button" onClick={() => { setManagedPage((current) => current - 1); setManagedLoading(true) }} disabled={managedLoading || managedPage <= 1}>{t('Previous')}</button>
          <span>{t('Page')} {managedPagination.current_page} {t('of')} {managedPagination.last_page}</span>
          <button className="secondary-button" type="button" onClick={() => { setManagedPage((current) => current + 1); setManagedLoading(true) }} disabled={managedLoading || managedPage >= managedPagination.last_page}>{t('Next')}</button>
        </nav>}
      </section>}

      <section className="admin-focus-grid">
        <section className="admin-panel approval-panel">
          <header className="admin-panel-heading"><div className="admin-panel-title"><span className="panel-icon panel-icon-coral"><Clock3 size={17} /></span><div><p className="eyebrow">{t('ACCESS REVIEW')}</p><h2>{t('Pending approvals')}</h2></div></div><span className="pending-count">{metrics?.users_pending ?? 0}</span></header>
          {(overview?.pending_users || []).length === 0 ? <div className="admin-empty"><Check size={17} />{t('No staff requests are waiting.')}</div> : (
            <div className="approval-list">
              {overview.pending_users.map((user) => <article className="approval-row" key={user.id}>
                <span className="admin-avatar">{user.name?.trim().charAt(0).toUpperCase()}</span>
                <div className="approval-copy"><strong>{user.name}</strong><span>{user.email}</span><small>{t(roleLabels[user.roles?.[0]] || 'Role not assigned')} · {t('Requested')} {formatDate(user.created_at, signedInUser?.locale)}</small></div>
                <button className="approve-button" type="button" onClick={() => runUserAction(user, 'approve')} disabled={busyId === user.id || !user.roles?.some((role) => assignableRoles.includes(role))} aria-label={`${t('Approve')} ${user.name}`} title={t('Approve account')}><Check size={15} /><span>{t(busyId === user.id ? 'Saving' : 'Approve')}</span></button>
              </article>)}
            </div>
          )}
        </section>

        <section className="admin-panel activity-panel">
          <header className="admin-panel-heading"><div className="admin-panel-title"><span className="panel-icon panel-icon-green"><Activity size={17} /></span><div><p className="eyebrow">{t('LEDGER')}</p><h2>{t('Recent transactions')}</h2></div></div></header>
          {(overview?.recent_transactions || []).length === 0 ? <div className="admin-empty">{t('No transactions recorded yet.')}</div> : (
            <div className="admin-activity-list">
              {overview.recent_transactions.map((transaction) => <article className="admin-activity-row" key={transaction.id}>
                <span className={`activity-type-icon activity-${transaction.type}`}>{transaction.type === 'purchase' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
                <div className="activity-copy"><strong>{transaction.student?.full_name || t('Student record removed')}</strong><span>{t(transactionLabel(transaction.type))} · {formatDate(transaction.created_at, signedInUser?.locale)}</span></div>
                <strong className={`activity-amount activity-amount-${transaction.type}`}>{transaction.type === 'purchase' ? '−' : '+'}{formatCurrency(transaction.amount)}</strong>
              </article>)}
            </div>
          )}
        </section>
      </section>

      <section className="admin-panel staff-panel" id="staff-accounts">
        <header className="staff-panel-heading"><div><p className="eyebrow">{t('DIRECTORY')}</p><h2>{t('Staff accounts')}</h2></div><span className="staff-total">{filteredUsers.length} {t('shown')}</span></header>
        <div className="staff-toolbar">
          <label className="staff-search"><Search size={16} /><span className="sr-only">{t('Search staff accounts')}</span><input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t('Name, email, username or role')} /></label>
          <label className="staff-filter"><span className="sr-only">{t('Filter by role')}</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">{t('All roles')}</option><option value="patron">{t('Patron')}</option><option value="matron">{t('Matron')}</option><option value="canteen-server">{t('Canteen server')}</option></select></label>
          <label className="staff-filter"><span className="sr-only">{t('Filter by status')}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
        </div>
        {actionError && <div className="form-error staff-action-error" role="alert">{t(actionError)}</div>}
        <div className="staff-table-head"><span>{t('STAFF MEMBER')}</span><span>{t('ROLE')}</span><span>{t('STATUS')}</span><span>{t('ACCOUNT ACTION')}</span></div>
        <div className="staff-table-body" aria-busy={loading}>
          {loading ? <div className="admin-empty">{t('Loading staff accounts...')}</div> : filteredUsers.length === 0 ? <div className="admin-empty">{t('No accounts match these filters.')}</div> : filteredUsers.map((user) => <article className="staff-row" key={user.id}>
            <div className="staff-identity"><span className="admin-avatar">{user.name?.trim().charAt(0).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email} · @{user.username}</small></span></div>
            <div className="staff-role">
              {user.roles?.includes('super-admin') && user.status !== 'pending' ? t('Administrator') : <div className="staff-role-editor">
                <select
                  aria-label={`${t('Assign role to')} ${user.name}`}
                  value={roleDrafts[user.id] ?? user.roles?.find((role) => assignableRoles.includes(role)) ?? ''}
                  onChange={(event) => setRoleDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                  disabled={busyId === user.id}
                >
                  <option value="" disabled>{t('Select role')}</option>
                  {assignableRoles.map((role) => <option key={role} value={role}>{t(roleLabels[role])}</option>)}
                </select>
                <button className="role-manage-button" type="button" onClick={() => assignUserRole(user)} disabled={busyId === user.id || !(roleDrafts[user.id] ?? user.roles?.find((role) => assignableRoles.includes(role)))}>{t(busyId === user.id ? 'Saving' : 'Assign role')}</button>
              </div>}
            </div>
            <span className={`status-pill status-${user.status}`}><i />{t(user.status)}</span>
            <div className="staff-actions">
              {user.status === 'pending' && <button className="approve-button" type="button" onClick={() => runUserAction(user, 'approve')} disabled={busyId === user.id || !user.roles?.some((role) => assignableRoles.includes(role))}><Check size={14} />{t('Approve')}</button>}
              {user.status === 'suspended' && <button className="reactivate-button" type="button" onClick={() => runUserAction(user, 'approve')} disabled={busyId === user.id}>{t('Reactivate')}</button>}
              {user.id === signedInUser?.id ? <span className="self-account-label">{t('Current account')}</span> : user.status !== 'suspended' && <>
                {confirmingId === user.id ? <><span className="confirm-label">{t('Suspend account?')}</span><button className="confirm-suspend" type="button" onClick={() => runUserAction(user, 'suspend')} disabled={busyId === user.id}>{t('Confirm')}</button><button className="cancel-suspend" type="button" onClick={() => setConfirmingId(null)} aria-label={t('Cancel suspend')}>{t('Cancel')}</button></> : <button className="suspend-button" type="button" onClick={() => setConfirmingId(user.id)} disabled={busyId === user.id}>{t('Suspend')}</button>}
              </>}
            </div>
          </article>)}
        </div>
      </section>
    </div>
  )
}
