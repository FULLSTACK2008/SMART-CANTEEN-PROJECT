import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/auth.js'
import { hasLowBalance } from '../lib/studentBalance.js'

export default function LowBalanceWarning({ student }) {
  const { t } = useAuth()
  if (!hasLowBalance(student)) return null

  return <span className="low-balance-warning"><AlertTriangle size={13} aria-hidden="true" />{t('Low balance')}</span>
}
