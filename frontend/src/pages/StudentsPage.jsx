import { useDeferredValue, useEffect, useState } from 'react'
import { ArchiveRestore, Plus, RotateCcw, Search, Trash2, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import StudentFormModal from '../components/StudentFormModal.jsx'
import StudentAvatar from '../components/StudentAvatar.jsx'
import LowBalanceWarning from '../components/LowBalanceWarning.jsx'
import { useAuth } from '../context/auth.js'
import api from '../lib/api.js'
import { formatCurrency } from '../lib/currency.js'
import { hasLowBalance } from '../lib/studentBalance.js'

const PAGE_SIZE = 50

export default function StudentsPage() {
  const { user, t } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showRecycle, setShowRecycle] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const deferredSearch = useDeferredValue(searchText)
  const roleLabel = t(user?.roles?.includes('matron') ? 'Matron' : 'Patron')

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      api.get(showRecycle ? '/students/recycle' : '/students', {
        params: {
          page,
          per_page: PAGE_SIZE,
          ...(!showRecycle && deferredSearch ? { search: deferredSearch } : {}),
        },
        signal: controller.signal,
      })
        .then(({ data }) => {
          if (!active) return
          setStudents(data.data || [])
          setPagination(data.meta || null)
        })
        .catch((requestError) => {
          if (active && requestError.code !== 'ERR_CANCELED') {
            setError(t(requestError.response?.data?.message || 'Student records could not be loaded.'))
          }
        })
        .finally(() => { if (active) setLoading(false) })
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [deferredSearch, page, showRecycle, t])

  function updateSearch(value) {
    setSearchText(value)
    setPage(1)
    setLoading(true)
  }

  function studentCreated(student) {
    setShowCreate(false)
    navigate(`/students/${student.id}`)
  }

  async function archiveAll() {
    if (!window.confirm(t('Move all your students to the recycle bin?'))) return
    setError('')
    setBusyId('all')

    try {
      await api.delete('/students/bulk')
      setStudents([])
      setPagination((current) => current ? { ...current, total: 0 } : current)
    } catch (requestError) {
      setError(t(requestError.response?.data?.message || 'Students could not be moved to the recycle bin.'))
    } finally {
      setBusyId(null)
    }
  }

  async function updateRecycledStudent(student, action) {
    if (action === 'permanent' && !window.confirm(t('Permanently delete this student and all of their wallet history?'))) return
    setError('')
    setBusyId(student.id)

    try {
      if (action === 'restore') {
        await api.patch(`/students/${student.id}/restore`)
      } else {
        await api.delete(`/students/${student.id}/permanent`)
      }
      setStudents((current) => current.filter((item) => item.id !== student.id))
      setPagination((current) => current ? { ...current, total: Math.max(current.total - 1, 0) } : current)
      if (students.length === 1 && page > 1) setPage((current) => current - 1)
    } catch (requestError) {
      setError(t(requestError.response?.data?.message || 'This student could not be updated.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="students-page">
      <header className="student-page-heading">
        <div>
          <p className="eyebrow">{roleLabel.toUpperCase()} WORKSPACE</p>
          <h1>{t('Student records')}</h1>
          <p className="page-subtitle">{t(showRecycle ? 'Restore students or permanently remove them from the recycle bin.' : 'Profiles and wallet balances for your assigned students.')}</p>
        </div>
        <div className="student-management-actions">
          <button className="secondary-button" type="button" onClick={() => { setShowRecycle((current) => !current); setPage(1); setLoading(true) }}>
            <ArchiveRestore size={15} />{t(showRecycle ? 'Back to students' : 'Recycle bin')}
          </button>
          {!showRecycle && <>
            <button className="secondary-button delete-all-button" type="button" onClick={archiveAll} disabled={busyId === 'all'}><Trash2 size={15} />{t(busyId === 'all' ? 'Moving...' : 'Delete all')}</button>
            <button className="primary-button add-student-button" type="button" onClick={() => setShowCreate(true)}><Plus size={17} />{t('Add student')}</button>
          </>}
        </div>
      </header>

      <section className="student-directory" aria-label={t('Student directory')}>
        <div className="directory-toolbar">
          <div className="directory-count"><strong>{pagination?.total ?? students.length}</strong><span>{t(showRecycle ? 'students in recycle bin' : 'students shown')}</span></div>
          {!showRecycle && <label className="student-search"><Search size={17} /><span className="sr-only">{t('Search by name or student number')}</span><input type="search" value={searchText} onChange={(event) => updateSearch(event.target.value)} placeholder={t('Name or student number')} /></label>}
        </div>

        {error && <div className="form-error directory-error" role="alert">{error}</div>}
        <div className={`student-table-head${showRecycle ? ' recycle-table-head' : ''}`}><span>{t('STUDENT')}</span><span>{t('Class')}</span>{!showRecycle && <><span>{t('WALLET BALANCE')}</span><span>{t('STATUS')}</span><span /></>}</div>
        <div className="student-table-body" aria-busy={loading}>
          {loading ? <div className="directory-empty">{t('Loading student records...')}</div> : students.length === 0 ? (
            <div className="directory-empty">
              <span className="empty-icon"><UsersRound size={21} /></span>
              <strong>{t(showRecycle ? 'The recycle bin is empty.' : searchText ? 'No matching students' : 'No student records yet')}</strong>
              <p>{t(showRecycle ? 'Deleted students will appear here, where you can restore or permanently delete them.' : searchText ? 'Try a different name or student number.' : 'Add your first student to start managing profiles and wallet balances.')}</p>
            </div>
          ) : showRecycle ? students.map((student) => (
            <article className="recycle-student-row" key={student.id}>
              <span className="student-identity"><StudentAvatar student={student} className="student-avatar" /><span><strong>{student.full_name}</strong><small>{student.student_number} · {t('Deleted')} {student.deleted_at ? new Date(student.deleted_at).toLocaleDateString() : ''}</small></span></span>
              <span className="student-class">{student.class || '—'}</span>
              <div className="recycle-student-actions">
                <button className="role-manage-button" type="button" onClick={() => updateRecycledStudent(student, 'restore')} disabled={busyId === student.id}><RotateCcw size={13} />{t('Restore')}</button>
                <button className="permanent-delete-button" type="button" onClick={() => updateRecycledStudent(student, 'permanent')} disabled={busyId === student.id}><Trash2 size={13} />{t('Delete permanently')}</button>
              </div>
            </article>
          )) : students.map((student) => (
            <Link className="student-table-row" to={`/students/${student.id}`} key={student.id}>
              <span className="student-identity"><StudentAvatar student={student} className="student-avatar" /><span><strong className={hasLowBalance(student) ? 'low-balance-name' : ''}>{student.full_name}</strong><small>{student.student_number}</small></span><LowBalanceWarning student={student} /></span>
              <span className="student-class">{student.class || '—'}</span>
              <strong className={`student-balance${hasLowBalance(student) ? ' low-balance-amount' : ''}`}>{formatCurrency(student.balance)}</strong>
              <span className={`student-status${student.is_active ? '' : ' inactive'}`}><i />{t(student.is_active ? 'Active' : 'Inactive')}</span>
              <span className="row-chevron" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
        {pagination?.last_page > 1 && <nav className="directory-pagination" aria-label={t('Student pages')}>
          <button className="secondary-button" type="button" onClick={() => { setPage((current) => current - 1); setLoading(true) }} disabled={loading || page <= 1}>{t('Previous')}</button>
          <span>{t('Page')} {pagination.current_page} {t('of')} {pagination.last_page}</span>
          <button className="secondary-button" type="button" onClick={() => { setPage((current) => current + 1); setLoading(true) }} disabled={loading || page >= pagination.last_page}>{t('Next')}</button>
        </nav>}
      </section>

      <p className="directory-footnote">{t(showRecycle ? 'Permanently deleting a student also removes their wallet history.' : 'Student access is limited to profiles assigned to your account.')}</p>
      {showCreate && <StudentFormModal onClose={() => setShowCreate(false)} onSaved={studentCreated} />}
    </div>
  )
}
