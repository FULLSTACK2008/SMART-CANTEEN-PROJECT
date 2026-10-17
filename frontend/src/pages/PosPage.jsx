import { useDeferredValue, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Cloud, CloudOff, ReceiptText, RefreshCw, RotateCcw, Search, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../context/auth.js'
import StudentAvatar from '../components/StudentAvatar.jsx'
import LowBalanceWarning from '../components/LowBalanceWarning.jsx'
import api from '../lib/api.js'
import { formatCurrency } from '../lib/currency.js'
import { formatDate } from '../lib/formatDate.js'
import { hasLowBalance } from '../lib/studentBalance.js'
import { syncQueuedSales } from '../lib/offlineSync.js'
import { cacheStudentDirectory, cacheStudentResults, findCachedStudents, listQueuedSales, listSavedStudentBatches, queueSale, removeQueuedSale, removeSavedStudentBatch, saveStudentBatch } from '../lib/offlineStore.js'

const errorMessages = {
  'INSUFFICIENT BALANCE': 'INSUFFICIENT BALANCE. Check the student’s current wallet balance.',
  DAILY_LIMIT_EXCEEDED: 'This sale exceeds the student’s daily spending limit.',
  STUDENT_INACTIVE: 'Purchases are disabled for this student account.',
}

function createBulkRow() {
  return { key: crypto.randomUUID(), uuid: crypto.randomUUID(), search: '', student: null, amount: '' }
}

function isValidBulkAmount(value) {
  const numericValue = Number(value)
  return Number.isSafeInteger(numericValue) && numericValue > 0
}

export default function PosPage() {
  const { user, t } = useAuth()
  const [studentSearch, setStudentSearch] = useState('')
  const [studentMatches, setStudentMatches] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [amount, setAmount] = useState('')
  const [purchaseError, setPurchaseError] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [reversing, setReversing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [queuedSales, setQueuedSales] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [confirmDiscardId, setConfirmDiscardId] = useState(null)
  const [entryMode, setEntryMode] = useState('single')
  const [bulkRows, setBulkRows] = useState([createBulkRow()])
  const [bulkMatches, setBulkMatches] = useState({})
  const [bulkError, setBulkError] = useState('')
  const [bulkSuccess, setBulkSuccess] = useState('')
  const [bulkAutoAddEnabled, setBulkAutoAddEnabled] = useState(true)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [savedBatches, setSavedBatches] = useState([])
  const [activeBatchId, setActiveBatchId] = useState(null)
  const [studentCacheFailed, setStudentCacheFailed] = useState(false)
  const deferredStudentSearch = useDeferredValue(studentSearch)

  useEffect(() => {
    const search = deferredStudentSearch.trim()
    if (search.length < 2 || selectedStudent) return undefined

    let active = true
    const controller = new AbortController()
    async function findStudents() {
      try {
        const { data } = await api.get('/students/search', {
          params: { q: search },
          signal: controller.signal,
        })
        if (!active) return
        const matches = data.data || []
        setStudentMatches(matches)
        await cacheStudentResults(user.id, matches)
      } catch {
        if (!active) return
        const matches = await findCachedStudents(user.id, search)
        if (active) setStudentMatches(matches)
      }
    }

    const timer = window.setTimeout(findStudents, 200)

    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [deferredStudentSearch, selectedStudent, user.id])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      const searchableRows = bulkRows.filter((row) => !row.student && row.search.trim().length >= 2)
      if (!searchableRows.length) {
        setBulkMatches({})
        return
      }

      try {
        const results = await Promise.all(searchableRows.map(async (row) => {
          const { data } = await api.get('/students/search', { params: { q: row.search.trim() } })
          const students = data.data || []
          await cacheStudentResults(user.id, students)
          return [row.key, students]
        }))
        if (active) setBulkMatches(Object.fromEntries(results))
      } catch {
        const results = await Promise.all(searchableRows.map(async (row) => (
          [row.key, await findCachedStudents(user.id, row.search)]
        )))
        if (active) setBulkMatches(Object.fromEntries(results))
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [bulkRows, t, user.id])

  useEffect(() => {
    if (!bulkAutoAddEnabled || entryMode !== 'bulk') return undefined
    const lastRow = bulkRows[bulkRows.length - 1]
    if (!lastRow || !lastRow.student || !isValidBulkAmount(lastRow.amount)) return undefined
    if (bulkRows.length >= 200) return undefined

    setBulkRows((rows) => {
      const currentRow = rows[rows.length - 1]
      if (!currentRow?.student || !isValidBulkAmount(currentRow.amount)) return rows
      return [...rows, createBulkRow()]
    })

    return undefined
  }, [bulkAutoAddEnabled, bulkRows, entryMode])

  useEffect(() => {
    let active = true
    async function refreshSavedBatches() {
      const batches = await listSavedStudentBatches(user.id)
      if (active) setSavedBatches(batches)
    }
    refreshSavedBatches()
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (entryMode !== 'bulk') return undefined
    if (!online) return undefined
    let active = true
    api.get('/students')
      .then(async ({ data }) => {
        await cacheStudentDirectory(user.id, data.data || [])
        if (active) setStudentCacheFailed(false)
      })
      .catch(() => {
        if (active) setStudentCacheFailed(true)
      })
    return () => { active = false }
  }, [entryMode, online, t, user.id])

  const chargeAmount = Number(amount)
  const validChargeAmount = Number.isSafeInteger(chargeAmount) && chargeAmount > 0

  useEffect(() => {
    let active = true

    async function refreshQueue() {
      const sales = await listQueuedSales(user.id)
      if (active) setQueuedSales(sales)
    }

    const updateOnline = () => {
      setOnline(navigator.onLine)
      if (!navigator.onLine) return

      syncQueuedSales(user.id).then(({ synced, sales }) => {
        if (!active) return
        setQueuedSales(sales)
        setSyncNotice(synced ? `${synced} queued sale${synced === 1 ? '' : 's'} synced.` : '')
        if (synced) window.dispatchEvent(new Event('canteen:notifications-changed'))
      }).catch(() => {})
    }

    refreshQueue()
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)

    return () => {
      active = false
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [user.id])

  async function completeSale(event) {
    event.preventDefault()
    if (!selectedStudent || !validChargeAmount) return

    setSubmitting(true)
    setPurchaseError('')

    const sale = {
      uuid: crypto.randomUUID(),
      student_id: selectedStudent.id,
      student_name: selectedStudent.full_name,
      amount: chargeAmount,
    }

    try {
      if (!navigator.onLine) throw new Error('OFFLINE')

      const { data } = await api.post('/transactions/purchase', {
        student_id: selectedStudent.id,
        uuid: sale.uuid,
        amount: sale.amount,
      })
      setReceipt(data.data)
      setSelectedStudent((current) => ({ ...current, balance: data.data.balance_after }))
      setAmount('')
      setStudentSearch('')
      setStudentMatches([])
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (error) {
      if (!error.response || !navigator.onLine) {
        await queueSale(user.id, sale)
        setQueuedSales(await listQueuedSales(user.id))
        setReceipt({ ...sale, status: 'queued' })
        setAmount('')
        setStudentSearch('')
        setStudentMatches([])
        setSyncNotice('Sale saved on this device and will sync when online.')
        return
      }

      setPurchaseError(t(errorMessages[error.response?.data?.code] || error.response?.data?.message || 'The sale could not be completed. Check your connection and retry.'))
      if (error.response?.data?.current_balance != null) {
        setSelectedStudent((current) => ({ ...current, balance: error.response.data.current_balance }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function updateBulkRow(key, changes) {
    setBulkRows((rows) => rows.map((row) => row.key === key
      ? { ...row, ...changes, uuid: crypto.randomUUID() }
      : row))
    setBulkMatches((matches) => {
      const nextMatches = { ...matches }
      delete nextMatches[key]
      return nextMatches
    })
    setBulkError('')
    setBulkSuccess('')
  }

  async function saveBulkList() {
    if (bulkSaving) return
    const hasEntries = bulkRows.some((row) => row.student || row.search.trim() || row.amount)
    if (!hasEntries) {
      setBulkError(t('Add at least one student or amount before saving this list.'))
      return
    }

    const uuid = activeBatchId || `saved-batch-${crypto.randomUUID()}`
    setBulkSaving(true)
    try {
      await saveStudentBatch(user.id, {
        uuid,
        rows: bulkRows.map(({ key, uuid: rowUuid, search, student, amount: rowAmount }) => ({
          key,
          uuid: rowUuid,
          search,
          student,
          amount: rowAmount,
        })),
      })
      setActiveBatchId(uuid)
      setSavedBatches(await listSavedStudentBatches(user.id))
      setBulkError('')
      setBulkSuccess(t(activeBatchId ? 'Saved list updated on this device.' : 'List saved on this device. You can charge these students later.'))
    } catch {
      setBulkError(t('This list could not be saved on this device. Check available storage and try again.'))
    } finally {
      setBulkSaving(false)
    }
  }

  function openSavedBatch(batch) {
    if (batch.uuid !== activeBatchId && bulkRows.some((row) => row.student || row.search.trim() || row.amount)) {
      if (!window.confirm(t('Replace the current entries with this saved list?'))) return
    }
    setBulkRows(batch.rows.map((row) => ({
      ...row,
      key: row.key || crypto.randomUUID(),
      uuid: row.uuid || crypto.randomUUID(),
    })))
    setBulkAutoAddEnabled(true)
    setActiveBatchId(batch.uuid)
    setBulkMatches({})
    setBulkError('')
    setBulkSuccess('')
    setEntryMode('bulk')
  }

  async function deleteSavedBatch(batch) {
    if (!window.confirm(t('Remove this saved student list from this device?'))) return
    try {
      await removeSavedStudentBatch(batch.uuid)
      setSavedBatches(await listSavedStudentBatches(user.id))
      if (activeBatchId === batch.uuid) setActiveBatchId(null)
    } catch {
      setBulkError(t('This saved list could not be removed. Please try again.'))
    }
  }

  async function submitBulkSales(event) {
    event.preventDefault()
    const occupiedRows = bulkRows.filter((row) => row.student || row.search.trim() || row.amount)
    const readyRows = occupiedRows.filter((row) => row.student && isValidBulkAmount(row.amount))
    const incompleteRows = occupiedRows.filter((row) => !row.student || !isValidBulkAmount(row.amount))

    if (!readyRows.length) {
      setBulkError(t('Select a student and enter a valid amount for the charge.'))
      return
    }
    if (incompleteRows.length) {
      setBulkError(t('Select a student and enter a valid amount for every completed row.'))
      return
    }
    if (!navigator.onLine || !online) {
      setBulkError(t('You are offline. Save this list on the device and charge students when the connection returns.'))
      return
    }
    const batchTotal = readyRows.reduce((total, row) => total + Number(row.amount), 0)
    if (!window.confirm(t('Submit {count} student charges for a total of {total}?', {
      count: readyRows.length,
      total: formatCurrency(batchTotal),
    }))) return

    setBulkSubmitting(true)
    setBulkError('')
    setBulkSuccess('')
    try {
      const { data } = await api.post('/transactions/purchase/bulk', {
        sales: readyRows.map((row) => ({
          student_id: row.student.id,
          amount: Number(row.amount),
          uuid: row.uuid,
        })),
      })
      setBulkSuccess(t('Submitted {count} student charges successfully. Total: {total}.', {
        count: data.data.length,
        total: formatCurrency(batchTotal),
      }))
      setBulkRows([createBulkRow()])
      setBulkAutoAddEnabled(true)
      setBulkMatches({})
      if (activeBatchId) {
        try {
          await removeSavedStudentBatch(activeBatchId)
          setSavedBatches(await listSavedStudentBatches(user.id))
        } catch {
          setBulkSuccess(t('This batch was charged, but its saved list could not be removed. Remove it from Saved student lists.'))
        }
        setActiveBatchId(null)
      }
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (error) {
      const firstValidationError = Object.values(error.response?.data?.errors || {})[0]?.[0]
      setBulkError(t(firstValidationError || error.response?.data?.message || 'The batch could not be submitted. No student was charged.'))
    } finally {
      setBulkSubmitting(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    setSyncNotice('')
    try {
      const { synced, sales } = await syncQueuedSales(user.id)
      setQueuedSales(sales)
      setSyncNotice(synced ? `${synced} queued sale${synced === 1 ? '' : 's'} synced.` : 'No queued sales could be synced.')
      if (synced) window.dispatchEvent(new Event('canteen:notifications-changed'))
    } finally {
      setSyncing(false)
    }
  }

  async function reverseSale() {
    if (!receipt?.id || receipt.status === 'queued' || receipt.is_reversed) return
    if (!navigator.onLine) {
      setPurchaseError(t('Connect to the internet to reverse a sale.'))
      return
    }
    if (!window.confirm(t('Reverse this entire sale and return the amount to the student wallet?'))) return

    setReversing(true)
    setPurchaseError('')
    try {
      const { data } = await api.post(`/transactions/${receipt.id}/reverse`)
      setSelectedStudent((current) => (
        current && current.id === receipt.student_id
          ? { ...current, balance: data.data.balance_after }
          : current
      ))
      setReceipt((current) => ({
        ...current,
        is_reversed: true,
        balance_after: data.data.balance_after,
      }))
      window.dispatchEvent(new Event('canteen:notifications-changed'))
    } catch (error) {
      setPurchaseError(t(error.response?.data?.message || 'The sale could not be reversed.'))
    } finally {
      setReversing(false)
    }
  }

  async function discardQueuedSale(uuid) {
    await removeQueuedSale(uuid)
    setQueuedSales(await listQueuedSales(user.id))
  }

  function startNextSale() {
    setReceipt(null)
    setSelectedStudent(null)
    setStudentSearch('')
    setPurchaseError('')
    setAmount('')
  }

  return (
    <div className="pos-page">
      <header className="pos-page-heading">
        <div>
          <p className="eyebrow">{t('CANTEEN SERVER · POINT OF SALE')}</p>
          <h1>{t('New sale')}</h1>
          <p className="page-subtitle">{t('Find a student, enter the amount used, and charge their wallet.')}</p>
        </div>
        <div className={`pos-open-status ${online ? '' : 'offline-status'}`}>
          {online ? <Cloud size={15} /> : <CloudOff size={15} />}
          <span>{t(online ? 'Online' : 'Offline')}</span>
        </div>
      </header>

      {receipt && (
        <section className="sale-receipt" role="status" aria-live="polite">
          <span className="receipt-check">{receipt.status === 'queued' ? <CloudOff size={19} /> : <CheckCircle2 size={20} />}</span>
          <div className="receipt-copy"><strong>{t(receipt.status === 'queued' ? 'Sale saved for sync' : receipt.is_reversed ? 'Sale reversed' : 'Sale complete')}</strong><span>{receipt.uuid} · {formatCurrency(receipt.amount ?? receipt.total)}{receipt.balance_after == null ? '' : ` · ${t('Balance')} ${formatCurrency(receipt.balance_after)}`}</span></div>
          {receipt.id && !receipt.is_reversed && <button className="secondary-button reverse-sale-button" type="button" onClick={reverseSale} disabled={!online || reversing}><RotateCcw size={14} />{t(reversing ? 'Reversing...' : 'Reverse sale')}</button>}
          {receipt.is_reversed && <span className="sale-reversed-label">{t('Reversed')}</span>}
          <button className="secondary-button" type="button" onClick={startNextSale}>{t('New sale')}</button>
        </section>
      )}

      {(queuedSales.length > 0 || syncNotice) && <section className="offline-queue-panel" aria-label={t('Offline sales queue')}>
        <div className="offline-queue-heading">
          <div><p className="eyebrow">{t('DEVICE OUTBOX')}</p><strong>{queuedSales.length} {t(queuedSales.length === 1 ? 'unsynced sale' : 'unsynced sales')}</strong>{syncNotice && <span>{t(syncNotice)}</span>}</div>
          {online && queuedSales.some((sale) => sale.status === 'queued') && <button className="secondary-button" type="button" onClick={syncNow} disabled={syncing}><RefreshCw size={14} className={syncing ? 'spin-icon' : ''} />{t(syncing ? 'Syncing' : 'Sync now')}</button>}
        </div>
        {queuedSales.map((sale) => <div className={`queued-sale-row${sale.status === 'needs_review' ? ' needs-review' : ''}`} key={sale.uuid}>
          {sale.status === 'needs_review' ? <AlertCircle size={15} /> : <CloudOff size={15} />}
          <span><strong>{sale.student_name} · {formatCurrency(sale.amount ?? sale.total)}</strong><small>{sale.status === 'needs_review' ? t(sale.error) : `${t('Queued')} ${formatDate(sale.queuedAt, user?.locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</small></span>
          {confirmDiscardId === sale.uuid ? <span className="queued-sale-confirm"><button type="button" onClick={() => { discardQueuedSale(sale.uuid); setConfirmDiscardId(null) }}>{t('Remove')}</button><button type="button" onClick={() => setConfirmDiscardId(null)}>{t('Keep')}</button></span> : <button className="icon-button" type="button" onClick={() => setConfirmDiscardId(sale.uuid)} aria-label={`${t('Remove queued sale for')} ${sale.student_name}`} title={t('Remove queued sale')}><Trash2 size={15} /></button>}
        </div>)}
      </section>}

      <div className="pos-entry-switch" role="group" aria-label={t('Entry mode')}>
        <button type="button" className={entryMode === 'single' ? 'active' : ''} aria-pressed={entryMode === 'single'} onClick={() => setEntryMode('single')}>{t('Single sale')}</button>
        <button type="button" className={entryMode === 'bulk' ? 'active' : ''} aria-pressed={entryMode === 'bulk'} onClick={() => setEntryMode('bulk')}>{t('End-of-day batch')}</button>
      </div>

      {entryMode === 'bulk' ? (
        <>
        {savedBatches.length > 0 && <section className="saved-batches-panel" aria-label={t('Saved student lists')}>
          <header className="saved-batches-heading"><div><p className="eyebrow">{t('ON THIS DEVICE')}</p><h2>{t('Saved student lists')}</h2></div><span>{savedBatches.length}</span></header>
          {savedBatches.map((batch) => {
            const count = batch.rows.filter((row) => row.student).length
            const total = batch.rows.reduce((sum, row) => sum + (Number.isSafeInteger(Number(row.amount)) && Number(row.amount) > 0 ? Number(row.amount) : 0), 0)
            return <div className={`saved-batch-row${batch.uuid === activeBatchId ? ' active' : ''}`} key={batch.uuid}>
              <button className="saved-batch-open" type="button" onClick={() => openSavedBatch(batch)}>
                <span><strong>{count} {t(count === 1 ? 'student' : 'students')} · {formatCurrency(total)}</strong><small>{t('Saved')} {formatDate(batch.updatedAt, user?.locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></span>
                <span className="saved-batch-open-label">{t(batch.uuid === activeBatchId ? 'Currently open' : 'Open list')}</span>
              </button>
              <button className="icon-button" type="button" onClick={() => deleteSavedBatch(batch)} aria-label={t('Remove saved list')} title={t('Remove saved list')}><Trash2 size={15} /></button>
            </div>
          })}
        </section>}
        <form className="bulk-entry-panel" onSubmit={submitBulkSales}>
          <header className="bulk-entry-heading">
            <div className="bulk-heading-copy"><p className="eyebrow">{t('END-OF-CANTEEN ENTRY')}</p><h2>{t('Record student charges')}</h2><p>{t('Add each student once, enter the amount they used, then submit all charges together.')}</p></div>
          </header>
          {!online && <div className="saved-list-notice" role="status"><CloudOff size={15} />{t('Offline mode: only previously downloaded active students can be selected.')}</div>}
          {online && studentCacheFailed && <div className="saved-list-notice" role="status"><CloudOff size={15} />{t('Student list could not be refreshed. Saved student records can still be used offline.')}</div>}
          {bulkSuccess && <div className="bulk-success" role="status"><CheckCircle2 size={16} />{bulkSuccess}</div>}
          {bulkError && <div className="form-error" role="alert"><AlertCircle size={15} />{bulkError}</div>}
          <div className="bulk-column-headings" aria-hidden="true">
            <span></span><span>{t('STUDENT')}</span><span>{t('AMOUNT USED')}</span><span></span>
          </div>
          <div className="bulk-entry-rows">
            {bulkRows.map((row, index) => (
              <div className="bulk-entry-row" key={row.key}>
                <span className="bulk-row-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="bulk-student-field">
                  {row.student ? (
                    <div className="bulk-selected-student">
                      <span><strong className={hasLowBalance(row.student) ? 'low-balance-name' : ''}>{row.student.full_name}</strong><small>{row.student.student_number} · {t('Balance')} {formatCurrency(row.student.balance)}{hasLowBalance(row.student) ? ` · ${t('Low balance')}` : ''}</small></span>
                      <LowBalanceWarning student={row.student} />
                      <button type="button" onClick={() => updateBulkRow(row.key, { student: null, search: '' })}>{t('Change')}</button>
                    </div>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`bulk-student-${row.key}`}>{t('Student name or ID')}</label>
                      <input id={`bulk-student-${row.key}`} type="search" value={row.search} onChange={(event) => updateBulkRow(row.key, { search: event.target.value, student: null })} placeholder={t('Student name or ID')} autoComplete="off" />
                      {row.search.trim().length >= 2 && <div className="bulk-student-matches">
                        {(bulkMatches[row.key] || []).filter((student) => !bulkRows.some((otherRow) => otherRow.key !== row.key && otherRow.student?.id === student.id)).length
                          ? (bulkMatches[row.key] || []).filter((student) => !bulkRows.some((otherRow) => otherRow.key !== row.key && otherRow.student?.id === student.id)).map((student) => <button type="button" key={student.id} onClick={() => updateBulkRow(row.key, { student, search: '' })}><strong>{student.full_name}</strong><small>{student.student_number} · {student.class || t('Class not set')}</small></button>)
                          : <span>{t(online ? 'No matching active students' : 'No saved student matches this search. Search for this student while online first.')}</span>}
                      </div>}
                    </>
                  )}
                </div>
                <label className="bulk-amount-field"><span>{t('Amount used')}</span><span className="bulk-amount-input"><span>RWF</span><input aria-label={`${t('Amount used')} ${row.student?.full_name || index + 1}`} type="number" min="1" step="1" inputMode="numeric" value={row.amount} onChange={(event) => updateBulkRow(row.key, { amount: event.target.value })} /></span></label>
                <button className="icon-button bulk-remove-row" type="button" onClick={() => setBulkRows((rows) => rows.length > 1 ? rows.filter((item) => item.key !== row.key) : rows)} aria-label={`${t('Remove row')} ${index + 1}`} disabled={bulkRows.length === 1}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <footer className="bulk-entry-footer">
            <div className="bulk-summary">
              <div className="bulk-summary-item"><span>{t('Students ready')}</span><strong>{bulkRows.filter((row) => row.student && isValidBulkAmount(row.amount)).length}<small> / {bulkRows.length}</small></strong></div>
              <div className="bulk-summary-item bulk-summary-total"><span>{t('Batch total')}</span><strong>{formatCurrency(bulkRows.reduce((total, row) => total + (row.student && isValidBulkAmount(row.amount) ? Number(row.amount) : 0), 0))}</strong></div>
            </div>
            <div className="bulk-entry-actions">
              <button className="secondary-button stop-bulk-auto-add-button" type="button" onClick={() => setBulkAutoAddEnabled((current) => !current)}>{t(bulkAutoAddEnabled ? 'Stop' : 'Continue auto-adding')}</button>
              <button className="secondary-button save-student-list-button" type="button" onClick={saveBulkList} disabled={bulkSaving}><Cloud size={15} />{t(bulkSaving ? 'Saving list...' : activeBatchId ? 'Update saved list' : 'Save list')}</button>
              <button className="primary-button" type="submit" disabled={bulkSubmitting || !online}><ReceiptText size={16} />{t(bulkSubmitting ? 'Submitting batch...' : 'Submit all charges')}</button>
            </div>
          </footer>
        </form>
        </>
      ) : (
      <div className="pos-grid">
        <div className="pos-main-column">
          <section className="pos-student-panel">
            <div className="pos-section-heading"><span className="pos-step">01</span><div><p className="eyebrow">{t('ACCOUNT')}</p><h2>{t('Select student')}</h2></div></div>
            {selectedStudent ? (
              <div className="selected-student">
                <span className="selected-student-avatar"><UserRound size={18} /></span>
                <div className="selected-student-copy"><strong>{selectedStudent.full_name}</strong><span>{selectedStudent.student_number}{selectedStudent.class ? ` · ${selectedStudent.class}` : ''}</span></div>
                <div className={`selected-student-balance${hasLowBalance(selectedStudent) ? ' low-balance-amount' : ''}`}><small>{t('WALLET')}</small><strong>{formatCurrency(selectedStudent.balance)}</strong>{hasLowBalance(selectedStudent) && <LowBalanceWarning student={selectedStudent} />}</div>
                <button className="clear-student" type="button" onClick={() => { setSelectedStudent(null); setStudentSearch(''); setPurchaseError('') }} aria-label={t('Change student')} title={t('Change student')}>{t('Change')}</button>
              </div>
            ) : (
              <div className="student-picker">
                <label className="pos-search">
                  <Search size={16} />
                  <span className="sr-only">{t('Search student by name or student number')}</span>
                  <input type="search" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentMatches([]) }} placeholder={t('Student name or ID')} autoComplete="off" />
                </label>
                {studentSearch.trim().length < 2 ? <p className="picker-hint">{t('Enter at least 2 characters to find a student.')}</p> : studentMatches.length === 0 ? <p className="picker-hint">{t('No active students match that search.')}</p> : (
                  <div className="student-suggestions" role="listbox" aria-label={t('Matching students')}>
                    {studentMatches.map((student) => <button className="student-suggestion" type="button" role="option" aria-selected="false" key={student.id} onClick={() => { setSelectedStudent(student); setStudentSearch(''); setStudentMatches([]); setPurchaseError('') }}>
                      <StudentAvatar student={student} className="student-suggestion-avatar" /><span className="student-suggestion-copy"><strong className={hasLowBalance(student) ? 'low-balance-name' : ''}>{student.full_name}</strong><small>{student.student_number} · {student.class || t('Class not set')}</small></span><span className={`suggestion-balance${hasLowBalance(student) ? ' low-balance-amount' : ''}`}>{formatCurrency(student.balance)}{hasLowBalance(student) && <LowBalanceWarning student={student} />}</span>
                    </button>)}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <form className="pos-cart-panel" onSubmit={completeSale}>
          <header className="cart-heading"><div><p className="eyebrow">{t('CHARGE')}</p><h2>{t('Enter amount')}</h2></div></header>
          {selectedStudent && <div className="cart-student-name"><span className={hasLowBalance(selectedStudent) ? 'low-balance-name' : ''}>{selectedStudent.full_name}<LowBalanceWarning student={selectedStudent} /></span><small className={hasLowBalance(selectedStudent) ? 'low-balance-amount' : ''}>{t('Current balance')} {formatCurrency(selectedStudent.balance)}</small></div>}
          {purchaseError && <div className="form-error cart-error" role="alert"><AlertCircle size={15} /><span>{purchaseError}</span></div>}
          <label className="charge-amount-field">
            <span>{t('Amount used')}</span>
            <span className="charge-amount-control"><span>RWF</span><input type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => { setAmount(event.target.value); setPurchaseError('') }} disabled={!selectedStudent} required /></span>
          </label>
          <div className="cart-total-row"><span>{t('Charge amount')}</span><strong>{formatCurrency(validChargeAmount ? chargeAmount : 0)}</strong></div>
          <button className="primary-button complete-sale-button" type="submit" disabled={!selectedStudent || !validChargeAmount || submitting}>
            <ReceiptText size={17} />{t(submitting ? 'Processing sale...' : 'Charge student wallet')}
          </button>
          <p className="cart-footnote">{t('The student’s wallet is checked before the charge is recorded.')}</p>
        </form>
      </div>
      )}
    </div>
  )
}
