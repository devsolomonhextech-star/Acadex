import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../features/auth/authHooks'
import { fetchAcademicTerms, fetchAcademicYears } from '../../features/academic/academicApi'
import type { AcademicTerm, AcademicYear } from '../api/types'

type AcademicPeriodValue = {
  years: AcademicYear[]
  terms: AcademicTerm[]
  yearId: string
  termId: string
  year: AcademicYear | undefined
  term: AcademicTerm | undefined
  loading: boolean
  setYearId: (id: string) => void
  setTermId: (id: string) => void
}

const AcademicPeriodContext = createContext<AcademicPeriodValue | null>(null)

function initialTermId(terms: AcademicTerm[]) {
  const today = dayjs()
  const current = terms.find(term => !today.isBefore(dayjs(term.starts_on), 'day') && !today.isAfter(dayjs(term.ends_on), 'day'))
  return current?.id ?? [...terms].sort((a, b) => b.ordinal - a.ordinal)[0]?.id ?? ''
}

// Default to the year actually running today, so a completed history year
// (which also carries status "active") never hijacks the workspace view.
function initialYearId(years: AcademicYear[]) {
  const today = dayjs()
  const current = years.find(year => !today.isBefore(dayjs(year.starts_on), 'day') && !today.isAfter(dayjs(year.ends_on), 'day'))
  return current?.id ?? years.find(year => year.status === 'active')?.id ?? years[0]?.id ?? ''
}

export function AcademicPeriodProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth()
  const [saved, setSaved] = useState<{ schoolId: string; yearId: string; termId: string } | null>(null)
  const storageKey = user ? `acadex-academic-period:${user.school_id}` : ''

  useEffect(() => {
    if (!storageKey || typeof localStorage === 'undefined') return
    try {
      const value = localStorage.getItem(storageKey)
      if (value) {
        const stored = JSON.parse(value) as { yearId?: string; termId?: string }
        setSaved({ schoolId: user!.school_id, yearId: stored.yearId ?? '', termId: stored.termId ?? '' })
      }
      else setSaved({ schoolId: user!.school_id, yearId: '', termId: '' })
    } catch {
      setSaved({ schoolId: user!.school_id, yearId: '', termId: '' })
    }
  }, [storageKey, user])

  const yearsQuery = useQuery({
    queryKey: ['academic-years', user?.school_id],
    queryFn: () => fetchAcademicYears(accessToken!),
    enabled: Boolean(accessToken && user),
  })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === saved?.yearId)
    ? saved!.yearId
    : initialYearId(years)
  const termsQuery = useQuery({
    queryKey: ['academic-terms', user?.school_id, yearId],
    queryFn: () => fetchAcademicTerms(accessToken!, yearId),
    enabled: Boolean(accessToken && user && yearId),
  })
  const terms = termsQuery.data ?? []
  const termId = terms.some(term => term.id === saved?.termId)
    ? saved!.termId
    : initialTermId(terms)

  const persist = (next: { yearId: string; termId: string }) => {
    if (!user) return
    setSaved({ schoolId: user.school_id, ...next })
    localStorage.setItem(`acadex-academic-period:${user.school_id}`, JSON.stringify(next))
  }
  const value = useMemo<AcademicPeriodValue>(() => ({
    years, terms, yearId, termId,
    year: years.find(year => year.id === yearId),
    term: terms.find(term => term.id === termId),
    loading: saved?.schoolId !== user?.school_id || yearsQuery.isLoading || termsQuery.isLoading,
    setYearId: id => persist({ yearId: id, termId: '' }),
    setTermId: id => persist({ yearId, termId: id }),
  }), [years, terms, yearId, termId, yearsQuery.isLoading, termsQuery.isLoading, saved?.schoolId, user])

  return <AcademicPeriodContext.Provider value={value}>{children}</AcademicPeriodContext.Provider>
}

export function useAcademicPeriod() {
  const value = useContext(AcademicPeriodContext)
  if (!value) throw new Error('useAcademicPeriod must be used inside AcademicPeriodProvider')
  return value
}
