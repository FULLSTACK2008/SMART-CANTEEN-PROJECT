import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CreditCard, Pencil, RotateCcw, Trash2, Wallet } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import StudentFormModal from '../components/StudentFormModal.jsx'
import StudentAvatar from '../components/StudentAvatar.jsx'
import LowBalanceWarning from '../components/LowBalanceWarning.jsx'
import api from '../lib/api.js'
import { currencyCode, formatCurrency } from '../lib/currency.js'
import { useAuth } from '../context/auth.js'
import { formatDate as formatLocalizedDate } from '../lib/formatDate.js'
import { hasLowBalance } from '../lib/studentBalance.js'

function formatDate(value, locale) {
  if (!value) return '—'
  return formatLocalizedDate(value, locale, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function getErrorMessage(error, t) {
  return Object.values(error.response?.data?.errors || {})[0]?.[0]
    || error.response?.data?.message
    || t('The wallet transaction could not be completed.')
}

export default function StudentDetailPage() {
  const { user, t } = useAuth()
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [transactionsLoading, setTransactionsLoading] = useState(true)
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionPagination, setTransactionPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [walletNotice, setWalletNotice] = useState('')
  const [walletMode, setWalletMode] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reversingId, setReversingId] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)

    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadingTimer = window.setTimeout(() => setLoading(true), 0)
    api.get(`/students/${studentId}`)
      .then(({ data }) => {
        if (!active) return
        setStudent(data.data)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(t(requestError.response?.data?.message || 'This student profile could not be opened.'))
      })
      .finally(() => {
        window.clearTimeout(loadingTimer)
        if (active) setLoading(false)
      })

    return () => {
      active = false
      window.clearTimeout(loadingTimer)
    }
  }, [studentId, refreshKey, t])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const loadingTimer = window.setTimeout(() => setTransactionsLoading(true), 0)

    api.get('/transactions/history', {
      params: { student_id: studentId, page: transactionPage, per_page: 50 },
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (!active) return
        setTransactions(data.data || [])
        setTransactionPagination(data.meta || null)
      })
      .catch((requestError) => {
        if (active && requestError.code !== 'ERR_CANCELED') {
          setError(t(requestError.response?.data?.message || 'This student profile could not be opened.'))
        }
      })
      .finally(() => {
        window.clearTimeout(loadingTimer)
        if (active) setTransactionsLoading(false)
      })

    return () => {
      active = false
      window.clearTimeout(loadingTimer)
      controller.abort()
    }
  }, [studentId, transactionPage, refreshKey, t])

  async function submitWallet(event) {
    event.preventDefault()
    if (!navigator.onLine) {
      setWalletError(t('Wallet updates require an internet connection.'))
      return
    }

    setSubmitting(true)
    setWalletError('')
    setWalletNotice('')

    const endpoint = walletMode === 'deposit' ? '/transactions/deposit' : '/transactions/refund'
    const payload = {
      student_id: Number(studentId),
      amount: Number(amount),
      uuid: crypto.randomUUID(),
      ...(walletMode === 'deposit' ? { note: note.trim() || undefined } : { reason: note.trim() }),
    }

    try {
      await api.post(endpoint, payload)
      setWalletNotice(t(walletMode === 'deposit' ? 'Deposit recorded.' : 'Refund recorded.'))
      setAmount('')
      setNote('')
      setTransactionPage(1)
      setRefreshKey((key) => key + 1)
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (requestError) {
      setWalletError(getErrorMessage(requestError, t))
    } finally {
      setSubmitting(false)
    }
  }

  async function reverseTransaction(transaction) {
    if (!navigator.onLine) {
      setWalletError(t('Connect to the internet to reverse a transaction.'))
      return
    }
    if (!window.confirm(t('Reverse this entire wallet transaction? This cannot be undone.'))) return

    setReversingId(transaction.id)
    setWalletError('')
    setWalletNotice('')
    try {
      await api.post(`/transactions/${transaction.id}/reverse`)
      setWalletNotice(t('Transaction reversed.'))
      setTransactionPage(1)
      setRefreshKey((key) => key + 1)
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (requestError) {
      setWalletError(getErrorMessage(requestError, t))
    } finally {
      setReversingId(null)
    }
  }

  async function archiveStudent() {
    if (!window.confirm(t('Move this student to the recycle bin?'))) return
    setDeleting(true)
    setDeleteError('')

    try {
      await api.delete(`/students/${studentId}`)
      navigate('/students')
    } catch (requestError) {
      setDeleteError(t(requestError.response?.data?.message || 'This student could not be moved to the recycle bin.'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="student-loading">{t('Loading student profile...')}</div>
  if (error || !student) {
    return <section className="student-load-error"><p className="eyebrow">{t('STUDENT RECORD')}</p><h1>{t('Profile unavailable')}</h1><p>{error || t('This student could not be found.')}</p><Link className="secondary-button button-link" to="/students"><ArrowLeft size={16} />{t('Back to students')}</Link></section>
  }

  return (
    <div className="student-detail-page">
      <button className="back-link" type="button" onClick={() => navigate('/students')}><ArrowLeft size={16} />{t('Student records')}</button>
      <header className="detail-heading">
        <div className="detail-person">
          <StudentAvatar student={student} className="detail-avatar" />
          <div><p className="eyebrow">{t('STUDENT PROFILE ·')} {student.student_number}</p><h1 className={hasLowBalance(student) ? 'low-balance-name' : ''}>{student.full_name} <LowBalanceWarning student={student} /></h1><p className="page-subtitle">{student.class || t('Class not set')} <span className="detail-dot">·</span> {t(student.is_active ? 'Active record' : 'Inactive record')}</p></div>
        </div>
        <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={archiveStudent} disabled={deleting}><Trash2 size={15} />{t(deleting ? 'Moving...' : 'Delete student')}</button>
          <button className="secondary-button edit-student-button" type="button" onClick={() => setEditing(true)}><Pencil size={15} />{t('Edit profile')}</button>
        </div>
      </header>

      {deleteError && <div className="form-error" role="alert">{deleteError}</div>}

      <div className="student-detail-grid">
        <div className="detail-main-column">
          <section className="profile-section">
            <header className="section-title"><div><p className="eyebrow">{t('PROFILE')}</p><h2>{t('Student information')}</h2></div></header>
            <div className="profile-facts">
              <div><span>{t('Student number')}</span><strong>{student.student_number}</strong></div>
              <div><span>{t('Class')}</span><strong>{student.class || t('Not set')}</strong></div>
              <div><span>{t('Guardian')}</span><strong>{student.guardian_name || t('Not set')}</strong></div>
              <div><span>{t('Guardian phone')}</span><strong>{student.guardian_phone || t('Not set')}</strong></div>
              <div><span>{t('Daily limit')}</span><strong>{student.daily_limit == null ? t('No limit') : formatCurrency(student.daily_limit)}</strong></div>
            </div>
            {student.notes && <p className="profile-notes">{student.notes}</p>}
          </section>

          <section className="history-section">
            <header className="section-title"><div><p className="eyebrow">{t('ACCOUNT ACTIVITY')}</p><h2>{t('Wallet history')}</h2></div><span className="history-total">{transactionPagination?.total ?? transactions.length} {t('records')}</span></header>
            {transactionsLoading && transactions.length === 0 ? <div className="history-empty">{t('Loading wallet history...')}</div> : transactions.length === 0 ? <div className="history-empty">{t('No wallet transactions have been recorded.')}</div> : (
              <div className="history-list">
                {transactions.map((transaction) => {
                  const decreasesBalance = transaction.balance_after < transaction.balance_before
                  return (
                    <article className="history-row" key={transaction.id}>
                    <span className={`transaction-symbol transaction-${transaction.type}`}>
                      {transaction.type === 'deposit' ? <ArrowUpRight size={16} /> : transaction.type === 'refund' || transaction.type === 'reversal' ? <RotateCcw size={15} /> : <CreditCard size={15} />}
                    </span>
                    <div className="history-copy"><strong>{t(transaction.type)}</strong><small>{transaction.note || t('Wallet transaction')} · {formatDate(transaction.created_at, user?.locale)}</small></div>
                    <div className={`history-amount${decreasesBalance ? ' debit' : ''}`}>
                      <strong>{decreasesBalance ? '−' : '+'}{formatCurrency(transaction.amount)}</strong>
                      <small>{t('Balance')} {formatCurrency(transaction.balance_after)}</small>
                      {['deposit', 'purchase'].includes(transaction.type) && !transaction.is_reversed && transaction.status === 'completed' && (
                        <button className="transaction-reverse-button" type="button" onClick={() => reverseTransaction(transaction)} disabled={!online || reversingId === transaction.id}>
                          <RotateCcw size={12} />{t(reversingId === transaction.id ? 'Reversing...' : 'Retrieve')}
                        </button>
                      )}
                    </div>
                    </article>
                  )
                })}
              </div>
            )}
            {transactionPagination?.last_page > 1 && <nav className="directory-pagination" aria-label={t('Transaction pages')}>
              <button className="secondary-button" type="button" onClick={() => { setTransactionPage((current) => current - 1); setTransactionsLoading(true) }} disabled={transactionsLoading || transactionPage <= 1}>{t('Previous')}</button>
              <span>{t('Page')} {transactionPagination.current_page} {t('of')} {transactionPagination.last_page}</span>
              <button className="secondary-button" type="button" onClick={() => { setTransactionPage((current) => current + 1); setTransactionsLoading(true) }} disabled={transactionsLoading || transactionPage >= transactionPagination.last_page}>{t('Next')}</button>
            </nav>}
          </section>
        </div>

        <aside className="wallet-panel">
          <div className="wallet-heading"><span className="wallet-icon"><Wallet size={18} /></span><div><p className="eyebrow">{t('STUDENT WALLET')}</p><span>{t('Current balance')}</span></div></div>
          <strong className={`wallet-balance${hasLowBalance(student) ? ' low-balance-amount' : ''}`}>{formatCurrency(student.balance)}</strong>
          {hasLowBalance(student) && <p className="low-balance-message" role="status"><LowBalanceWarning student={student} /></p>}
          <p className="wallet-student-number">{student.student_number} <span>·</span> {student.full_name}</p>

          <div className="wallet-tabs" role="group" aria-label={t('Wallet transaction type')}>
            <button type="button" aria-pressed={walletMode === 'deposit'} className={walletMode === 'deposit' ? 'selected' : ''} onClick={() => { setWalletMode('deposit'); setNote(''); setWalletError(''); setWalletNotice('') }}>{t('Deposit')}</button>
            <button type="button" aria-pressed={walletMode === 'refund'} className={walletMode === 'refund' ? 'selected' : ''} onClick={() => { setWalletMode('refund'); setNote(''); setWalletError(''); setWalletNotice('') }}>{t('Refund')}</button>
          </div>

          {walletError && <div className="form-error wallet-feedback" role="alert">{walletError}</div>}
          {walletNotice && <div className="form-success wallet-feedback" role="status">{walletNotice}</div>}
          <form className="wallet-form" onSubmit={submitWallet}>
            <label htmlFor="wallet-amount">{t('Amount')}</label>
            <div className="amount-input"><span>{currencyCode}</span><input id="wallet-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
            <label htmlFor="wallet-note">{t(walletMode === 'deposit' ? 'Note' : 'Refund reason')}</label>
            <input id="wallet-note" type="text" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} required={walletMode === 'refund'} placeholder={t(walletMode === 'deposit' ? 'Optional reference' : 'Reason for refund')} />
            <button className="primary-button wallet-submit" type="submit" disabled={!online || submitting}>{t(submitting ? 'Processing...' : walletMode === 'deposit' ? 'Record deposit' : 'Record refund')}</button>
          </form>
          <p className="wallet-footnote">{t(!online ? 'Wallet updates require an internet connection.' : walletMode === 'deposit' ? 'Use Retrieve in wallet history to undo an incorrect deposit.' : 'Transactions are recorded to the student ledger.')}</p>
        </aside>
      </div>

      {editing && <StudentFormModal student={student} onClose={() => setEditing(false)} onSaved={(updatedStudent) => { setStudent(updatedStudent); setEditing(false) }} />}
    </div>
  )
}
