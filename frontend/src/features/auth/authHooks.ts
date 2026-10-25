import { useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { apiRequest, fetchCurrentUser, readCsrfCookie, registerSchool, rotateSession, setSessionRefresher, signIn, signOutRequest, verifySignInTotp } from '../../shared/api/client'
import type { SchoolUser } from '../../shared/api/types'
import { authInitialized, sessionCleared, sessionEstablished } from './authSlice'

let restoreRequest: Promise<{ user: SchoolUser; accessToken: string } | null> | null = null

function restoreSession() {
  restoreRequest ??= (async () => {
    if (!readCsrfCookie()) return null
    const session = await rotateSession()
    const user = await fetchCurrentUser(session.access_token)
    return { user, accessToken: session.access_token }
  })()
  return restoreRequest
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const session = await restoreSession()
        if (active && session) dispatch(sessionEstablished(session))
        else if (active) dispatch(sessionCleared())
      } catch {
        if (active) dispatch(sessionCleared())
      } finally {
        if (active) dispatch(authInitialized())
      }
    }
    void restore()
    return () => { active = false }
  }, [dispatch])

  useEffect(() => {
    // Single-flight: parallel 401s share one refresh so token rotation never races itself.
    let inFlight: Promise<string | null> | null = null
    const refresh = () => (inFlight ??= (async () => {
      try {
        const session = await rotateSession()
        const user = await fetchCurrentUser(session.access_token)
        dispatch(sessionEstablished({ user, accessToken: session.access_token }))
        return session.access_token
      } catch {
        dispatch(sessionCleared())
        return null
      } finally {
        inFlight = null
      }
    })())
    setSessionRefresher(refresh)
    return () => setSessionRefresher(null)
  }, [dispatch])

  return children
}

export function useAuth() {
  const dispatch = useAppDispatch()
  const queryClient = useQueryClient()
  const { user, accessToken, initialized } = useAppSelector(state => state.auth)

  const signInToSchool = useCallback(async (school: string, email: string, password: string) => {
    const session = await signIn(school, email, password)
    if ('requires_two_factor' in session && session.requires_two_factor) return { requiresTwoFactor: true as const, challengeToken: session.challenge_token }
    const currentUser = await fetchCurrentUser(session.access_token)
    queryClient.clear()
    dispatch(sessionEstablished({ user: currentUser, accessToken: session.access_token }))
    return { requiresTwoFactor: false as const }
  }, [dispatch, queryClient])

  const completeTwoFactorSignIn = useCallback(async (challengeToken: string, code: string) => {
    const session = await verifySignInTotp(challengeToken, code)
    const currentUser = await fetchCurrentUser(session.access_token)
    queryClient.clear()
    dispatch(sessionEstablished({ user: currentUser, accessToken: session.access_token }))
  }, [dispatch, queryClient])

  const signOut = useCallback(async () => {
    try { await signOutRequest() } finally {
      queryClient.clear()
      dispatch(sessionCleared())
    }
  }, [dispatch, queryClient])

  return { user: user as SchoolUser | null, accessToken, loading: !initialized, signInToSchool, completeTwoFactorSignIn, signOut }
}

export function createSchool(payload: {
  school_name: string; school_slug: string; administrator_name: string; email: string; password: string
}) {
  return apiRequest<{ school_id: string; school_slug: string; status: string; message: string }>(
    '/onboarding/schools', { method: 'POST', body: JSON.stringify(payload) },
  )
}

export { registerSchool }
