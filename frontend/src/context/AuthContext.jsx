import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './auth.js'
import api from '../lib/api.js'
import { translate } from './translations.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [localeOverride, setLocaleOverride] = useState(() => localStorage.getItem('canteen_locale') || 'en')
  const [ready, setReady] = useState(() => !sessionStorage.getItem('canteen_token'))
  const locale = user?.locale || localeOverride
  const t = useCallback((text, values) => translate(locale, text, values), [locale])

  useEffect(() => {
    let active = true
    const expireSession = () => {
      sessionStorage.removeItem('canteen_token')
      sessionStorage.removeItem('canteen_user')
      if (active) setUser(null)
    }

    window.addEventListener('canteen:unauthorized', expireSession)
    if (sessionStorage.getItem('canteen_token')) {
      api.get('/auth/me')
        .then(({ data }) => { if (active) setUser(data.data) })
        .catch((error) => {
          const cachedUser = sessionStorage.getItem('canteen_user')

          if (!error.response && cachedUser) {
            try {
              if (active) setUser(JSON.parse(cachedUser))
              return
            } catch {
              expireSession()
              return
            }
          }

          expireSession()
        })
        .finally(() => { if (active) setReady(true) })
    }

    return () => {
      active = false
      window.removeEventListener('canteen:unauthorized', expireSession)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = user?.theme || 'light'
  }, [user?.theme])

  useEffect(() => {
    document.documentElement.lang = user?.locale || localeOverride
  }, [user?.locale, localeOverride])

  async function login(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    sessionStorage.setItem('canteen_token', data.token)
    sessionStorage.setItem('canteen_user', JSON.stringify(data.data))
    setUser(data.data)
    setLocaleOverride(data.data.locale || 'en')
    localStorage.setItem('canteen_locale', data.data.locale || 'en')
    return data.data
  }

  async function register(details) {
    const { data } = await api.post('/auth/register', details)
    return data.data
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      sessionStorage.removeItem('canteen_token')
      sessionStorage.removeItem('canteen_user')
      setUser(null)
    }
  }

  async function updatePreferences(preferences) {
    const { data } = await api.patch('/auth/preferences', preferences)
    setUser(data.data)
    setLocaleOverride(data.data.locale || 'en')
    localStorage.setItem('canteen_locale', data.data.locale || 'en')
    sessionStorage.setItem('canteen_user', JSON.stringify(data.data))
    return data.data
  }

  function changeLocale(locale) {
    localStorage.setItem('canteen_locale', locale)
    setLocaleOverride(locale)
    setUser((current) => current ? { ...current, locale } : current)
  }

  return <AuthContext.Provider value={{ user, ready, login, register, logout, updatePreferences, changeLocale, t }}>{children}</AuthContext.Provider>
}