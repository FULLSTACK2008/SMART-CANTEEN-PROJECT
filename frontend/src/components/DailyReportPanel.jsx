import { useEffect, useState } from 'react'
import { CalendarDays, Download, Printer, UsersRound } from 'lucide-react'
import api from '../lib/api.js'
import { formatCurrency } from '../lib/currency.js'
import { useAuth } from '../context/auth.js'
import StudentAvatar from './StudentAvatar.jsx'
import LowBalanceWarning from './LowBalanceWarning.jsx'
import { hasLowBalance } from '../lib/studentBalance.js'

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const groupLabels = { male: 'Boys', female: 'Girls' }

function printReportPdf(report, t, jsPDF) {
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = document.internal.pageSize.getWidth()
  const pageHeight = document.internal.pageSize.getHeight()
  const margin = 12
  const tableWidth = pageWidth - margin * 2
  const columns = [
    { label: t('Student'), width: 65 },
    { label: t('Student number'), width: 36 },
    { label: t('Class'), width: 42 },
    { label: t('Purchases'), width: 27 },
    { label: t('Amount spent'), width: 48 },
    { label: t('Balance remaining'), width: 55 },
  ]
  const widthScale = tableWidth / columns.reduce((total, column) => total + column.width, 0)
  columns.forEach((column) => { column.width *= widthScale })
  let y = 16

  function drawPageHeading() {
    document.setFont('helvetica', 'bold')
    document.setFontSize(17)
    document.setTextColor(31, 64, 47)
    document.text(t('Daily student report'), margin, 16)
    document.setFont('helvetica', 'normal')
    document.setFontSize(9)
    document.setTextColor(86, 99, 90)
    document.text(`${t('Report date')}: ${report.date}`, margin, 22)
    document.setDrawColor(207, 219, 207)
    document.line(margin, 26, pageWidth - margin, 26)
    if (report.groups.some((group) => group.students.some(hasLowBalance))) {
      document.setFontSize(8)
      document.setTextColor(190, 45, 45)
      document.text(`! ${t('Low balance')}: ${t('RWF 1,000 or less')}`, pageWidth - margin, 22, { align: 'right' })
    }
    y = 32
  }

  function ensureSpace(height) {
    if (y + height <= pageHeight - margin) return
    document.addPage()
    drawPageHeading()
  }

  drawPageHeading()
  for (const group of report.groups) {
    ensureSpace(18)
    document.setFont('helvetica', 'bold')
    document.setFontSize(11)
    document.setTextColor(44, 74, 53)
    document.text(`${t(groupLabels[group.gender])} · ${group.student_count} ${t('students')}`, margin, y)
    y += 5

    document.setFillColor(239, 244, 238)
    document.rect(margin, y, tableWidth, 8, 'F')
    document.setFontSize(8)
    document.setTextColor(72, 87, 76)
    let x = margin
    columns.forEach((column) => {
      document.text(column.label, x + 2, y + 5.3, { maxWidth: column.width - 4 })
      x += column.width
    })
    y += 8

    for (const student of group.students) {
      const nameLines = document.splitTextToSize(student.full_name, columns[0].width - (hasLowBalance(student) ? 10 : 4))
      const rowHeight = Math.max(8, nameLines.length * 4 + 3)
      ensureSpace(rowHeight + 1)
      document.setFont('helvetica', 'normal')
      document.setFontSize(8)
      document.setTextColor(42, 51, 44)
      document.text(nameLines, margin + 2, y + 4)
      if (hasLowBalance(student)) {
        document.setFont('helvetica', 'bold')
        document.setTextColor(190, 45, 45)
        document.text('!', margin + columns[0].width - 7, y + 4)
      }
      const values = [
        student.student_number,
        student.class || '—',
        String(student.purchase_count),
        formatCurrency(student.total_spent),
        formatCurrency(student.balance),
      ]
      x = margin + columns[0].width
      values.forEach((value, index) => {
        if (index === 4 && hasLowBalance(student)) document.setTextColor(190, 45, 45)
        else document.setTextColor(42, 51, 44)
        document.setFont('helvetica', 'normal')
        document.text(String(value), x + 2, y + 4, { maxWidth: columns[index + 1].width - 4 })
        x += columns[index + 1].width
      })
      y += rowHeight
      document.setDrawColor(225, 231, 224)
      document.line(margin, y, margin + tableWidth, y)
    }

    ensureSpace(9)
    document.setFont('helvetica', 'bold')
    document.setFontSize(8)
    document.setTextColor(43, 69, 49)
    document.text(t('Group total'), margin + 2, y + 5)
    const totalValues = [
      '',
      '',
      `${group.purchase_count} ${t('purchases')}`,
      formatCurrency(group.total_spent),
      '',
    ]
    x = margin + columns[0].width
    totalValues.forEach((value, index) => {
      if (value) document.text(value, x + 2, y + 5, { maxWidth: columns[index + 1].width - 4 })
      x += columns[index + 1].width
    })
    y += 12
  }

  ensureSpace(15)
  document.setDrawColor(164, 181, 166)
  document.line(margin, y, margin + tableWidth, y)
  y += 7
  document.setFont('helvetica', 'bold')
  document.setFontSize(10)
  document.setTextColor(31, 64, 47)
  document.text(`${t('Report total')}: ${report.total_students} ${t('students purchased')}`, margin, y)
  document.text(`${t('Amount spent')}: ${formatCurrency(report.total_spent)}`, pageWidth - margin, y, { align: 'right' })
  document.save(`daily-student-report-${report.date}.pdf`)
}

export default function DailyReportPanel() {
  const { t } = useAuth()
  const [date, setDate] = useState(localDate)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/reports/daily', { params: { date } })
      .then(({ data }) => {
        if (active) {
          setReport(data)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(t(requestError.response?.data?.message || 'The daily report could not be loaded.'))
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [date, t])

  function updateDate(event) {
    setLoading(true)
    setDate(event.target.value)
  }

  async function downloadReport() {
    if (!report) return
    setDownloading(true)

    try {
      const { jsPDF } = await import('jspdf')
      printReportPdf(report, t, jsPDF)
    } catch {
      setError(t('The report could not be downloaded.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section className="daily-report" aria-labelledby="daily-report-title" aria-busy={loading}>
      <header className="daily-report-heading">
        <div><p className="eyebrow">{t('PURCHASE ACTIVITY')}</p><h2 id="daily-report-title">{t('Daily student report')}</h2></div>
        <div className="report-heading-actions">
          <div className="report-export-actions">
            <button className="secondary-button report-action-button" type="button" onClick={() => window.print()} disabled={!report || loading}><Printer size={15} />{t('Print report')}</button>
            <button className="secondary-button report-action-button" type="button" onClick={downloadReport} disabled={!report || loading || downloading}><Download size={15} />{t(downloading ? 'Generating report...' : 'Download report')}</button>
          </div>
          <label className="report-date"><CalendarDays size={16} /><span className="sr-only">{t('Report date')}</span><input type="date" value={date} max={localDate()} onChange={updateDate} aria-label={t('Report date')} /></label>
        </div>
      </header>
      <p className="report-print-date">{t('Report date')}: {report?.date || date}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && !report ? <div className="admin-empty">{t('Loading daily report...')}</div> : report?.groups?.length ? (
        <div className="report-groups">
          {report.groups.map((group) => (
            <section className="report-group" key={group.gender} aria-label={`${t(groupLabels[group.gender])} ${t('daily purchases')}`}>
              <header className="report-group-heading"><h3>{t(groupLabels[group.gender])}</h3><span>{group.student_count} {t('students')}</span></header>
              <div className="report-table-scroll">
                <table className="report-table">
                  <thead><tr><th>{t('Student')}</th><th>{t('Class')}</th><th>{t('Purchases')}</th><th>{t('Amount spent')}</th><th>{t('Balance remaining')}</th></tr></thead>
                  <tbody>{group.students.map((student) => <tr key={student.id}>
                    <td><span className="report-student"><StudentAvatar student={student} className="report-avatar" /><span><strong className={hasLowBalance(student) ? 'low-balance-name' : ''}>{student.full_name}</strong><small>{student.student_number}</small></span><LowBalanceWarning student={student} /></span></td>
                    <td>{student.class || '—'}</td>
                    <td>{student.purchase_count}</td>
                    <td>{formatCurrency(student.total_spent)}</td>
                    <td className={hasLowBalance(student) ? 'low-balance-amount' : ''}>{formatCurrency(student.balance)}</td>
                  </tr>)}</tbody>
                  <tfoot><tr><th colSpan="2">{t('Group total')}</th><td>{group.purchase_count} {t('purchases')}</td><td>{formatCurrency(group.total_spent)}</td><td>—</td></tr></tfoot>
                </table>
              </div>
            </section>
          ))}
          <footer className="report-grand-total"><span><UsersRound size={16} />{report.total_students} {t('students purchased')}</span><strong>{formatCurrency(report.total_spent)}</strong></footer>
        </div>
      ) : <div className="admin-empty">{t('No completed purchases for this date.')}</div>}
    </section>
  )
}