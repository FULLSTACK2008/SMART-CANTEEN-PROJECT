import { ArrowUpRight, Bell, ShieldCheck, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth.js'
import DailyReportPanel from '../components/DailyReportPanel.jsx'
import { formatDate } from '../lib/formatDate.js'

const roleNames = {
  'super-admin': 'Administrator',
  patron: 'Patron',
  matron: 'Matron',
  'canteen-server': 'Canteen server',
}

export default function DashboardPage() {
  const { user, t } = useAuth()
  const role = t(roleNames[user?.roles?.[0]] || 'Staff')
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there'
  const dateLabel = formatDate(new Date(), user?.locale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>{t('Good day,')} {firstName}<span className="welcome-period">.</span></h1>
          <p className="page-subtitle">{t('Your canteen workspace is ready.')}</p>
        </div>
        <div className="role-chip"><span className="status-dot" />{role}</div>
      </section>

      <DailyReportPanel />

      <div className="dashboard-section-heading">
        <div><p className="eyebrow">{t('YOUR ACCOUNT')}</p><h2>{t('At a glance')}</h2></div>
      </div>

      <section className="overview-grid" aria-label={t('Account overview')}>
        <article className="overview-panel account-panel">
          <div className="panel-icon panel-icon-green"><ShieldCheck size={19} /></div>
          <div className="panel-content">
            <span className="panel-label">{t('ACCESS STATUS')}</span>
            <strong>{t('Active')}</strong>
            <p>{t('Your account has been approved.')}</p>
          </div>
          <span className="panel-value">01</span>
        </article>
        <Link className="overview-panel notification-panel" to="/notifications">
          <div className="panel-icon panel-icon-coral"><Bell size={19} /></div>
          <div className="panel-content">
            <span className="panel-label">{t('UPDATES')}</span>
            <strong>{t('Notification inbox')}</strong>
            <p>{t('Review account and wallet updates.')}</p>
          </div>
          <ArrowUpRight className="panel-arrow" size={18} />
        </Link>
        {(user?.roles?.includes('patron') || user?.roles?.includes('matron')) && <Link className="overview-panel notification-panel" to="/students">
          <div className="panel-icon panel-icon-green"><UsersRound size={19} /></div>
          <div className="panel-content">
            <span className="panel-label">{t('STUDENT RECORDS')}</span>
            <strong>{t('Managed students')}</strong>
            <p>{t('View profiles and manage wallet balances.')}</p>
          </div>
          <ArrowUpRight className="panel-arrow" size={18} />
        </Link>}
        {user?.roles?.includes('super-admin') && <Link className="overview-panel notification-panel" to="/admin">
          <div className="panel-icon panel-icon-coral"><ShieldCheck size={19} /></div>
          <div className="panel-content">
            <span className="panel-label">{t('STAFF & SYSTEM')}</span>
            <strong>{t('Administration')}</strong>
            <p>{t('Review access requests and activity.')}</p>
          </div>
          <ArrowUpRight className="panel-arrow" size={18} />
        </Link>}
      </section>

      <footer className="dashboard-footnote"><span className="footnote-line" />{t('APACOPE CANTEEN MANAGEMENT')}<span className="footnote-line" /></footer>
    </div>
  )
}
