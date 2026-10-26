import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notification } from 'antd'
import { useAuth } from '../auth/authHooks'
import type { TimetableSlot } from '../../shared/api/types'
import { fetchTodayTimetable } from './timetableApi'

export type LessonAlert = {
  key: string
  kind: 'starting' | 'ended'
  title: string
  detail: string
}

/** Keys already shown this session, so a poll cycle never repeats a lesson. */
const announced = new Set<string>()

/** Parse "HH:MM" against today's date so slot times compare with Date.now(). */
function todayAt(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

function clockOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')}`
}

function localDayKey() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const SOON_MS = 15 * 60 * 1000
const GRACE_MS = 10 * 60 * 1000

/**
 * Watches today's lessons and raises two in-app alerts: one when a lesson starts
 * in fifteen minutes, and one when a teacher's lesson has ended. Each fires once
 * per lesson per session.
 */
export function useLessonAlerts() {
  const { accessToken, user } = useAuth()
  const [alerts, setAlerts] = useState<LessonAlert[]>([])
  const [api, contextHolder] = notification.useNotification()

  const todayQuery = useQuery({
    queryKey: ['timetable-today', user?.school_id],
    queryFn: () => fetchTodayTimetable(accessToken!),
    enabled: !!accessToken,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    const slots = todayQuery.data
    if (!slots?.length) return
    const now = Date.now()
    const fresh: LessonAlert[] = []

    slots.forEach((slot: TimetableSlot) => {
      const start = todayAt(slot.starts_at)
      const end = todayAt(slot.ends_at)
      const label = `${slot.subject_name} · ${slot.class_name}`

      if (now >= start - SOON_MS && now < start) {
        const key = `soon-${localDayKey()}-${slot.id}`
        if (announced.has(key)) return
        announced.add(key)
        const minutes = Math.max(1, Math.ceil((start - now) / 60_000))
        fresh.push({
          key, kind: 'starting', title: `Lesson in ${minutes} minute${minutes === 1 ? '' : 's'}`,
          detail: `${label} starts at ${clockOf(slot.starts_at)} with ${slot.teacher_name}${slot.room ? ` in ${slot.room}` : ''}`,
        })
      } else if (now >= end && now < end + GRACE_MS) {
        const key = `ended-${localDayKey()}-${slot.id}`
        if (announced.has(key)) return
        announced.add(key)
        fresh.push({
          key, kind: 'ended', title: "Teacher's time is up",
          detail: `${label} ended at ${clockOf(slot.ends_at)}`,
        })
      }
    })

    if (!fresh.length) return
    setAlerts(previous => [...fresh, ...previous].slice(0, 4))
    // Reverse so the newest lesson sits on top of the notification stack.
    fresh.slice().reverse().forEach(alert => {
      api.open({
        key: alert.key,
        message: alert.title,
        description: alert.detail,
        duration: alert.kind === 'ended' ? 8 : 10,
        placement: 'topRight',
        type: alert.kind === 'ended' ? 'warning' : 'info',
      })
    })
  }, [todayQuery.data, api])

  const dismiss = (key: string) => setAlerts(previous => previous.filter(alert => alert.key !== key))

  return { alerts, dismiss, contextHolder }
}
