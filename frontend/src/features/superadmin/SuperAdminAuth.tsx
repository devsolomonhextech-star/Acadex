import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  consoleLogin, consoleLogout, fetchConsoleMe, hasConsoleSession,
  refreshConsoleSession, type PlatformAdmin,
} from './superadminApi'

type ConsoleAuth = {
  admin: PlatformAdmin | null
  token: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const SuperAdminContext = createContext<ConsoleAuth | null>(null)

export function SuperAdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<number | null>(null)

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  const endSession = useCallback(() => {
    clearTimer()
    setAdmin(null)
    setToken(null)
  }, [])

  // Console tokens are short-lived; rotate them silently while the tab is open.
  const scheduleRefresh = useCallback((expiresInSeconds: number | null) => {
    clearTimer()
    const delay = Math.max((expiresInSeconds ?? 600) - 90, 30) * 1000
    timer.current = window.setTimeout(async () => {
      try {
        const session = await refreshConsoleSession()
        if (session.access_token) setToken(session.access_token)
        if (session.admin) setAdmin(session.admin)
        scheduleRefresh(session.expires_in)
      } catch {
        endSession()
      }
    }, delay)
  }, [endSession])

  useEffect(() => {
    let active = true
    const restore = async () => {
      if (!hasConsoleSession()) return
      try {
        const session = await refreshConsoleSession()
        if (!active || !session.access_token) return
        const identity = await fetchConsoleMe(session.access_token)
        if (!active) return
        setToken(session.access_token)
        setAdmin(identity)
        scheduleRefresh(session.expires_in)
      } catch {
        if (active) endSession()
      }
    }
    void restore().finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      clearTimer()
    }
  }, [endSession, scheduleRefresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await consoleLogin(email, password)
    if (!session.access_token) throw new Error('The console did not return a session')
    setToken(session.access_token)
    setAdmin(session.admin)
    scheduleRefresh(session.expires_in)
  }, [scheduleRefresh])

  const signOut = useCallback(async () => {
    try { await consoleLogout() } catch { /* Clear locally even if the network call fails. */ }
    endSession()
  }, [endSession])

  return <SuperAdminContext.Provider value={{ admin, token, loading, signIn, signOut }}>
    {children}
  </SuperAdminContext.Provider>
}

export function useSuperAdmin() {
  const context = useContext(SuperAdminContext)
  if (!context) throw new Error('useSuperAdmin must be used inside SuperAdminAuthProvider')
  return context
}
