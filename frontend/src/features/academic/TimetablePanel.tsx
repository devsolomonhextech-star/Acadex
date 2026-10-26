import { useMemo, useState } from 'react'
import { Alert, Avatar, Button, Empty, Form, Input, Modal, Select, TimePicker, message } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../auth/authHooks'
import type { ClassGroup, TimetableSlot } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { fetchTeachingAssignments, fetchSubjects } from './teachingApi'
import { createTimetableSlot, deleteTimetableSlot, fetchTimetable } from './timetableApi'

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const GRID_DAYS = [0, 1, 2, 3, 4, 5]
/** Pixels per hour in the grid; shared by the time axis and lesson positioning. */
const HOUR_PX = 64

type SlotFields = {
  class_group_id?: string
  subject_id?: string
  teacher_membership_id?: string
  day_of_week?: number
  times?: [Dayjs, Dayjs]
  room?: string
}

/** Total minutes from midnight, so lessons sort and compare as plain numbers. */
function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function mondayOf(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - (result.getDay() + 6) % 7)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function teacherInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function teacherColor(name: string) {
  const colors = ['#5b79ec', '#19a989', '#e38a50', '#8865d6', '#d5657d', '#278ca8']
  return colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]
}

export function TimetablePanel({ yearId, classes }: { yearId: string; classes: ClassGroup[] }) {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [teacherFilter, setTeacherFilter] = useState<string>('')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState((new Date().getDay() + 6) % 7)
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'schedule'>('week')
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm<SlotFields>()
  const canManage = ['school_admin', 'registrar'].includes(user?.role ?? '')

  const classId = classes.some(group => group.id === selectedClass) ? selectedClass : classes[0]?.id ?? ''
  const weekDates = Array.from({ length: 7 }, (_, day) => addDays(weekStart, day))
  const agendaDays = [...GRID_DAYS, 6]
  const displayDays = calendarView === 'day' ? [selectedDay] : GRID_DAYS
  const miniMonthStart = mondayOf(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1))
  const miniDates = Array.from({ length: 42 }, (_, index) => addDays(miniMonthStart, index))
  const weekLabel = `${weekDates[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDates[5].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const slotsQuery = useQuery({
    queryKey: ['timetable', user?.school_id, yearId],
    queryFn: () => fetchTimetable(accessToken!, yearId),
    enabled: !!accessToken && !!yearId,
  })
  const subjectsQuery = useQuery({ queryKey: ['subjects', user?.school_id], queryFn: () => fetchSubjects(accessToken!), enabled: !!accessToken })
  const assignmentsQuery = useQuery({
    queryKey: ['teaching-assignments', user?.school_id, yearId],
    queryFn: () => fetchTeachingAssignments(accessToken!, yearId),
    enabled: !!accessToken && !!yearId,
  })

  const assignments = assignmentsQuery.data ?? []
  const allSlots = slotsQuery.data ?? []
  const teacherOptions = useMemo(() => {
    const seen = new Map<string, string>()
    assignments.forEach(item => seen.set(item.teacher_membership_id, item.teacher_name))
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [assignments])

  /** One teacher may hold several classes and subjects; the filter narrows the grid to their lessons. */
  const slots = useMemo(() => {
    return allSlots
      .filter(slot => !classId || slot.class_group_id === classId)
      .filter(slot => !teacherFilter || slot.teacher_membership_id === teacherFilter)
      .sort((a, b) => minutesOf(a.starts_at) - minutesOf(b.starts_at))
  }, [allSlots, classId, teacherFilter])

  /** Group into `day -> lesson list` so each column of the grid renders in time order. */
  const byDay = useMemo(() => {
    const map = new Map<number, TimetableSlot[]>()
    slots.forEach(slot => {
      const list = map.get(slot.day_of_week) ?? []
      list.push(slot)
      map.set(slot.day_of_week, list)
    })
    return map
  }, [slots])

  const daySpan = useMemo(() => {
    const times = slots.flatMap(slot => [minutesOf(slot.starts_at), minutesOf(slot.ends_at)])
    if (!times.length) return { from: 8 * 60, to: 15 * 60 }
    return { from: Math.max(0, Math.min(...times) - 30), to: Math.min(24 * 60, Math.max(...times) + 30) }
  }, [slots])

  const createMutation = useMutation({
    mutationFn: (values: SlotFields) => createTimetableSlot(accessToken!, {
      academic_year_id: yearId,
      class_group_id: String(values.class_group_id),
      subject_id: String(values.subject_id),
      teacher_membership_id: String(values.teacher_membership_id),
      day_of_week: Number(values.day_of_week),
      starts_at: values.times?.[0].format('HH:mm') ?? '',
      ends_at: values.times?.[1].format('HH:mm') ?? '',
      room: values.room?.trim() || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['timetable', user?.school_id, yearId] })
      toast.success('Lesson added to the timetable')
      setCreateOpen(false)
      form.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const removeMutation = useMutation({
    mutationFn: (slotId: string) => deleteTimetableSlot(accessToken!, slotId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['timetable', user?.school_id, yearId] })
      toast.success('Lesson removed')
    },
    onError: error => toast.error(formatApiError(error)),
  })

  /** Only lessons whose class and subject really are taught by the chosen teacher. */
  const teacherAssignments = useMemo(() => {
    const teacher = form.getFieldValue('teacher_membership_id')
    const classGroup = form.getFieldValue('class_group_id')
    return assignments.filter(item =>
      (!teacher || item.teacher_membership_id === teacher)
      && (!classGroup || item.class_group_id === classGroup))
  }, [assignments, form, createOpen])

  const subjectOptions = useMemo(() => {
    const seen = new Map<string, { value: string; label: string }>()
    teacherAssignments.forEach(item => {
      if (!seen.has(item.subject_id)) seen.set(item.subject_id, { value: item.subject_id, label: `${item.subject_name} · ${item.subject_code}` })
    })
    if (!seen.size) (subjectsQuery.data ?? []).forEach(subject => seen.set(subject.id, { value: subject.id, label: `${subject.name} · ${subject.code}` }))
    return [...seen.values()]
  }, [teacherAssignments, subjectsQuery.data])

  const pageError = slotsQuery.error ?? assignmentsQuery.error

  const moveWeek = (amount: number) => {
    const next = addDays(weekStart, amount)
    setWeekStart(next)
    setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }

  /** Place a lesson against the time axis; HOUR_PX matches the grid's row height. */
  const positionFor = (slot: TimetableSlot) => {
    const start = Math.max(0, minutesOf(slot.starts_at) - daySpan.from)
    const span = Math.max(30, minutesOf(slot.ends_at) - minutesOf(slot.starts_at))
    return { top: (start / 60) * HOUR_PX, height: (span / 60) * HOUR_PX - 4 }
  }

  return <section className="academic-section panel timetable-panel">
    {contextHolder}
    <div className="timetable-page-heading">
      <div><span className="timetable-page-kicker">YOUR SCHOOL CALENDAR</span><h2>Class timetable</h2><p>{allSlots.length} lessons scheduled across {classes.length} classes</p></div>
      <div className="timetable-page-actions">
        <Button onClick={() => { const today = new Date(); const start = mondayOf(today); setWeekStart(start); setSelectedDay((today.getDay() + 6) % 7); setCalendarMonth(new Date(start.getFullYear(), start.getMonth(), 1)) }}>Today</Button>
        <Button aria-label="Previous week" onClick={() => moveWeek(-7)}>‹</Button>
        <Button aria-label="Next week" onClick={() => moveWeek(7)}>›</Button>
        <strong>{weekLabel}</strong>
        <Select
          className="timetable-teacher-filter"
          allowClear
          placeholder="All teachers"
          aria-label="Filter by teacher"
          value={teacherFilter || undefined}
          onChange={value => setTeacherFilter(value ?? '')}
          options={teacherOptions}
        />
        <div className="timetable-view-toggle" role="group" aria-label="Calendar view">
          {(['day', 'week', 'schedule'] as const).map(view => <button type="button" key={view} className={calendarView === view ? 'active' : ''} onClick={() => setCalendarView(view)}>{view[0].toUpperCase()}{view.slice(1)}</button>)}
        </div>
        {canManage && <Button type="primary" icon={<PlusOutlined />}
          disabled={!classes.length || !assignments.length}
          onClick={() => { form.resetFields(); setCreateOpen(true) }}>Add lesson</Button>}
      </div>
    </div>
    {pageError && <Alert type="error" showIcon message="Could not load the timetable" description={formatApiError(pageError)} className="student-error" />}

    <div className="timetable-calendar-layout">
    <aside className="timetable-calendar-rail">
      <section className="timetable-mini-calendar">
        <header><strong>{calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong><span><button aria-label="Previous month" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><button aria-label="Next month" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></span></header>
        <div className="timetable-mini-weekdays">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
        <div className="timetable-mini-days">{miniDates.map((date, index) => {
          const isCurrentMonth = date.getMonth() === calendarMonth.getMonth()
          const selected = date >= weekStart && date < addDays(weekStart, 7)
          const today = date.toDateString() === new Date().toDateString()
          return <button key={index} className={`${isCurrentMonth ? '' : 'outside'}${selected ? ' selected' : ''}${today ? ' today' : ''}`} onClick={() => {
            const start = mondayOf(date); setWeekStart(start); setSelectedDay((date.getDay() + 6) % 7); setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
          }}>{date.getDate()}</button>
        })}</div>
      </section>
      <section className="timetable-summary-card"><span className="timetable-summary-label">WEEK AT A GLANCE</span><div className="timetable-summary-donut"><strong>{slots.length}</strong><small>lessons</small></div><div className="timetable-summary-stats"><div><strong>{new Set(slots.map(slot => slot.class_group_id)).size}</strong><span>classes</span></div><div><strong>{new Set(slots.map(slot => slot.teacher_membership_id)).size}</strong><span>teachers</span></div></div></section>
      <section className="timetable-teacher-card"><span className="timetable-summary-label">TEACHERS ON THIS CLASS</span><div className="timetable-teacher-list">{[...new Map(allSlots.filter(slot => !classId || slot.class_group_id === classId).map(slot => [slot.teacher_membership_id, slot.teacher_name])).entries()].map(([id, name]) => <div key={id}><Avatar size={30} style={{ backgroundColor: teacherColor(name), fontSize: 11, fontWeight: 700 }}>{teacherInitials(name)}</Avatar><span>{name}</span></div>)}</div></section>
    </aside>
    <div className="timetable-calendar-main">
    {classes.length > 0 && <div className="timetable-class-row">
      {classes.map(group => <button key={group.id} className={`class-chip ${classId === group.id ? 'selected' : ''}`} onClick={() => setSelectedClass(group.id)}>
        <span className="class-chip-name">{group.name}</span><span>{group.stream ? `Stream ${group.stream}` : group.grade_level}</span>
      </button>)}
    </div>}

    {slotsQuery.isLoading ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Loading timetable…" />
      : slots.length === 0
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={assignments.length ? 'No lessons scheduled yet' : 'Assign a teacher to a subject first, then add lessons'} />
        : calendarView === 'schedule' ? <div className="timetable-agenda">
            {agendaDays.map(day => <section key={day}><header><strong>{WEEK_DAYS[day]}</strong><span>{weekDates[day].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></header>
              {(byDay.get(day) ?? []).length ? (byDay.get(day) ?? []).map(slot => <article key={slot.id} className="timetable-agenda-event"><span>{slot.starts_at}–{slot.ends_at}</span><div><strong>{slot.subject_name}</strong><small>{slot.class_name} · {slot.teacher_name}{slot.room ? ` · Room ${slot.room}` : ''}</small></div><Avatar size={28} style={{ backgroundColor: teacherColor(slot.teacher_name), fontSize: 10, fontWeight: 700 }}>{teacherInitials(slot.teacher_name)}</Avatar></article>) : <p>No lessons scheduled</p>}
            </section>)}
          </div> : <div className="timetable-grid" role="table" aria-label={calendarView === 'day' ? 'Daily timetable' : 'Weekly timetable'}>
            <div className="timetable-grid-row timetable-head" role="row" style={{ gridTemplateColumns: `52px repeat(${displayDays.length}, minmax(106px, 1fr))` }}>
              <div className="timetable-time-cell" role="columnheader">TIME</div>
              {displayDays.map(day => <button key={day} type="button" role="columnheader" className="timetable-date-heading" onClick={() => { setSelectedDay(day); setCalendarView('day') }}><span>{WEEK_DAYS[day].slice(0, 3)}</span><b>{weekDates[day]?.getDate() ?? weekStart.getDate()}</b></button>)}
            </div>
            <div className="timetable-grid-row timetable-body" role="row" style={{ gridTemplateColumns: `52px repeat(${displayDays.length}, minmax(106px, 1fr))` }}>
              <div className="timetable-time-axis">
                {Array.from({ length: Math.floor((daySpan.to - daySpan.from) / 60) + 1 }, (_, index) => {
                  const total = daySpan.from + index * 60
                  return <span key={total}>{String(Math.floor(total / 60)).padStart(2, '0')}:00</span>
                })}
              </div>
              {displayDays.map(day => <div className="timetable-day-column" key={day}>
                {(byDay.get(day) ?? []).map(slot => <article key={slot.id} className="timetable-lesson" style={positionFor(slot)} title={`${slot.subject_name} · ${slot.teacher_name}`}>
                  <div className="timetable-lesson-top"><strong>{slot.subject_code}</strong><span title={slot.teacher_name}><Avatar size={22} style={{ backgroundColor: teacherColor(slot.teacher_name), fontSize: 9, fontWeight: 700 }}>{teacherInitials(slot.teacher_name)}</Avatar></span></div>
                  <span className="lesson-name">{slot.subject_name}</span>
                  <span className="lesson-time">{slot.starts_at}–{slot.ends_at}</span>
                  <span className="lesson-teacher">{slot.room ? `Room ${slot.room}` : slot.teacher_name}</span>
                  {canManage && <button className="lesson-remove" aria-label={`Remove ${slot.subject_name} on ${slot.day_name}`}
                    onClick={() => removeMutation.mutate(slot.id)} disabled={removeMutation.isPending}><DeleteOutlined /></button>}
                </article>)}
              </div>)}
            </div>
          </div>}
    </div>
    </div>

    <Modal title="Add a lesson to the timetable" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={values => createMutation.mutate(values)} className="academic-form">
        <Form.Item name="class_group_id" label="Class group" rules={[{ required: true, message: 'Choose a class' }]}>
          <Select showSearch optionFilterProp="label" options={classes.map(group => ({ value: group.id, label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}` }))} />
        </Form.Item>
        <Form.Item name="teacher_membership_id" label="Teacher" rules={[{ required: true, message: 'Choose a teacher' }]}>
          <Select showSearch optionFilterProp="label" options={teacherOptions}
            onChange={() => { form.setFieldValue('subject_id', undefined) }} />
        </Form.Item>
        <Form.Item name="subject_id" label="Subject" rules={[{ required: true, message: 'Choose a subject' }]}>
          <Select showSearch optionFilterProp="label" options={subjectOptions}
            placeholder={teacherAssignments.length ? 'Choose a subject' : 'Assign this teacher first'} />
        </Form.Item>
        <Form.Item name="day_of_week" label="Day" rules={[{ required: true, message: 'Choose a day' }]}>
          <Select options={WEEK_DAYS.map((day, index) => ({ value: index, label: day }))} />
        </Form.Item>
        <Form.Item name="times" label="Lesson time" rules={[{ required: true, message: 'Choose start and end times' }]}>
          <TimePicker.RangePicker format="HH:mm" minuteStep={5} />
        </Form.Item>
        <Form.Item name="room" label="Room (optional)">
          <Input maxLength={40} placeholder="Room 204" />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Add lesson</Button>
        </div>
      </Form>
    </Modal>
  </section>
}
