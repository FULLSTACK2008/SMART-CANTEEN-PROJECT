import { useState } from 'react'
import { ArrowRight, CheckCircle2, Eye, EyeOff, Utensils } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth.js'

function getErrorMessage(error, t) {
  const validationMessage = Object.values(error.response?.data?.errors || {})[0]?.[0]
  return t(validationMessage || error.response?.data?.message || 'We could not connect. Check your details and try again.')
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, ready, login, register, t, changeLocale } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', password_confirmation: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!ready) return <main className="auth-loading">{t('Opening your workspace...')}</main>
  if (user) return <Navigate to="/dashboard" replace />

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (isRegister) {
        await register(form)
        setSubmitted(true)
      } else {
        await login({ email: form.email, password: form.password })
        navigate('/dashboard', { replace: true })
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand-panel">
        <div className="auth-brand-head">
          <span className="brand-mark brand-mark-light"><Utensils size={19} strokeWidth={2.2} /></span>
          <span className="brand-name brand-name-light">APACOPE<span>CANTEEN</span></span>
        </div>
        <div className="brand-art" aria-hidden="true">
          <div className="art-ring art-ring-one" /><div className="art-ring art-ring-two" />
          <div className="art-plate"><div className="plate-food"><i /><i /><i /><b /></div></div>
          <span className="art-leaf art-leaf-one" /><span className="art-leaf art-leaf-two" />
          <span className="art-spark art-spark-one">✳</span><span className="art-spark art-spark-two">✳</span>
        </div>
        <div className="brand-panel-footer">
          <span className="brand-kicker">{t('SCHOOL MEALS · ACCOUNTABLE BY DESIGN')}</span>
          <p>{t('Good service starts')}<br />{t('with a clear view.')}</p>
          <span className="brand-panel-caption">{t('APACOPE Canteen Management')}</span>
        </div>
        <div className="brand-panel-pattern" aria-hidden="true" />
      </section>

      <section className="auth-form-panel">
        <label className="auth-locale"><span className="sr-only">{t('Language')}</span><select value={user?.locale || localStorage.getItem('canteen_locale') || 'en'} onChange={(event) => changeLocale(event.target.value)} aria-label={t('Language')}><option value="en">{t('English')}</option><option value="rw">{t('Kinyarwanda')}</option><option value="fr">{t('French')}</option></select></label>
        <div className="auth-form-wrap">
          {submitted ? (
            <div className="pending-state" role="status">
              <span className="pending-icon"><CheckCircle2 size={25} /></span>
              <p className="eyebrow">{t('REQUEST RECEIVED')}</p>
              <h1>{t('Thanks,')} {form.name.split(' ')[0]}.</h1>
              <p className="form-description">{t('Your account is waiting for administrator approval. You can sign in once it has been activated.')}</p>
              <Link className="primary-button button-link" to="/login">{t('Back to sign in')} <ArrowRight size={17} /></Link>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <p className="eyebrow">{t(isRegister ? 'STAFF ACCESS' : 'WELCOME BACK')}</p>
                <h1>{t(isRegister ? 'Request an account' : 'Sign in to your workspace')}</h1>
                <p className="form-description">{t(isRegister ? 'Create your staff profile. Access is enabled after approval.' : 'Use your approved staff account to continue.')}</p>
              </div>

              {error && <div className="form-error" role="alert">{error}</div>}

              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister && <>
                  <label className="field-label" htmlFor="name">{t('Full name')}</label>
                  <input id="name" name="name" autoComplete="name" value={form.name} onChange={updateField} required maxLength={255} />
                  <label className="field-label" htmlFor="username">{t('Username')}</label>
                  <input id="username" name="username" autoComplete="username" value={form.username} onChange={updateField} required maxLength={255} />
                </>}

                <label className="field-label" htmlFor="email">{t('Email address')}</label>
                <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} required />

                <label className="field-label" htmlFor="password">{t('Password')}</label>
                <div className="password-field">
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} value={form.password} onChange={updateField} required minLength={8} />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={t(showPassword ? 'Hide password' : 'Show password')}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>

                {isRegister && <>
                  <label className="field-label" htmlFor="password_confirmation">{t('Confirm password')}</label>
                  <input id="password_confirmation" name="password_confirmation" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={updateField} required minLength={8} />
                </>}

                <button className="primary-button auth-submit" type="submit" disabled={busy}>
                  {t(busy ? 'Please wait...' : isRegister ? 'Submit account request' : 'Sign in')}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </form>

              <p className="auth-switch">{t(isRegister ? 'Already have an account?' : 'New to the team?')}{' '}
                <Link to={isRegister ? '/login' : '/register'}>{t(isRegister ? 'Sign in' : 'Request access')}</Link>
              </p>
            </>
          )}
        </div>
        <footer className="auth-footer"><span>{t('APACOPE CANTEEN')}</span><span>{t('STAFF PORTAL')}</span></footer>
      </section>
    </main>
  )
}
