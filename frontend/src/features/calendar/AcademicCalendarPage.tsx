import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert, Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, message,
  Modal, Popconfirm, Select, Spin, Tag,
} from 'antd'
import {
  CalendarOutlined, ClockCircleOutlined, DownloadOutlined, LeftOutlined, PlusOutlined,
  RightOutlined, TeamOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { fetchClassGroups } from '../academic/academicApi'
import { formatApiError } from '../../shared/api/errors'
import type { AcademicCalendarEvent } from '../../shared/api/types'
import { createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, seedCalendarEvents } from './calendarApi'

type CalendarView = 'month' | 'week' | 'agenda'
type EventForm = { title: string; category: AcademicCalendarEvent['category']; dates: [Dayjs, Dayjs]; audience: AcademicCalendarEvent['audience']; class_group_id?: string; description?: string }

const categories: { value: AcademicCalendarEvent['category']; label: string }[] = [
  { value: 'term', label: 'Term dates' }, { value: 'holiday', label: 'Holiday / break' },
  { value: 'exam', label: 'Examination' }, { value: 'assessment', label: 'Assessment' },
  { value: 'meeting', label: 'Meeting' }, { value: 'event', label: 'School event' },
  { value: 'other', label: 'Other' },
]
const audiences: { value: AcademicCalendarEvent['audience']; label: string }[] = [
  { value: 'all', label: 'Whole school' }, { value: 'students', label: 'Students' },
  { value: 'parents', label: 'Parents & guardians' }, { value: 'staff', label: 'All staff' },
  { value: 'teachers', label: 'Teaching staff' }, { value: 'class', label: 'One class' },
]
const categoryLabels = Object.fromEntries(categories.map(item => [item.value, item.label])) as Record<AcademicCalendarEvent['category'], string>
const categoryAudienceLabels = Object.fromEntries(audiences.map(item => [item.value, item.label])) as Record<AcademicCalendarEvent['audience'], string>

function mondayOf(date: Dayjs) {
  return date.startOf('day').subtract((date.day() + 6) % 7, 'day')
}

function eventOccursOn(event: AcademicCalendarEvent, date: Dayjs) {
  return !date.isBefore(dayjs(event.starts_on), 'day') && !date.isAfter(dayjs(event.ends_on), 'day')
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export default function AcademicCalendarPage() {
  const { accessToken, user } = useAuth()
  const canEdit = Boolean(user && ['school_admin', 'principal', 'registrar'].includes(user.role))
  const { years, terms, yearId, termId, year, term, setYearId, setTermId, loading: periodLoading } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [toast, toastContext] = message.useMessage()
  const [view, setView] = useState<CalendarView>('month')
  const [viewMonth, setViewMonth] = useState(() => dayjs().startOf('month'))
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<AcademicCalendarEvent | null>(null)
  const [form] = Form.useForm<EventForm>()
  const audience = Form.useWatch('audience', form)

  useEffect(() => {
    if (term?.starts_on) setViewMonth(dayjs(term.starts_on).startOf('month'))
    else if (year?.starts_on) setViewMonth(dayjs(year.starts_on).startOf('month'))
  }, [termId, yearId])

  const eventsQuery = useQuery({
    queryKey: ['academic-calendar', user?.school_id, yearId, termId],
    queryFn: () => fetchCalendarEvents(accessToken!, yearId, termId || undefined),
    enabled: Boolean(accessToken && yearId && !periodLoading),
  })
  const classesQuery = useQuery({
    queryKey: ['class-groups', user?.school_id, yearId],
    queryFn: () => fetchClassGroups(accessToken!, yearId),
    enabled: Boolean(accessToken && yearId && !periodLoading),
  })
  const events = eventsQuery.data ?? []
  const classes = classesQuery.data ?? []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['academic-calendar', user?.school_id] })

  const createMutation = useMutation({
    mutationFn: (values: EventForm) => createCalendarEvent(accessToken!, {
      academic_year_id: yearId,
      term_id: termId || null,
      ...(values.audience === 'class' ? { class_group_id: values.class_group_id } : {}),
      title: values.title.trim(), category: values.category, audience: values.audience,
      starts_on: values.dates[0].format('YYYY-MM-DD'),
      ends_on: values.dates[1].format('YYYY-MM-DD'),
      description: values.description?.trim() || null,
    }),
    onSuccess: async () => {
      await invalidate()
      setEventModalOpen(false)
      form.resetFields()
      toast.success('Calendar event added')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteCalendarEvent(accessToken!, eventId),
    onSuccess: async () => {
      await invalidate()
      setSelectedEvent(null)
      toast.success('Calendar event removed')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const seedMutation = useMutation({
    mutationFn: () => seedCalendarEvents(accessToken!, yearId, termId),
    onSuccess: async result => {
      await invalidate()
      toast.success(result.created ? `Added ${result.created} sample calendar events` : 'Sample calendar events are already present')
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const openCreate = (date?: Dayjs) => {
    const requestedStart = date ?? (term?.starts_on ? dayjs(term.starts_on) : dayjs().startOf('day'))
    const yearStart = year?.starts_on ? dayjs(year.starts_on) : requestedStart
    const yearEnd = year?.ends_on ? dayjs(year.ends_on) : requestedStart
    const termStart = term?.starts_on ? dayjs(term.starts_on) : yearStart
    const termEnd = term?.ends_on ? dayjs(term.ends_on) : yearEnd
    const start = requestedStart.isBefore(termStart, 'day') ? termStart : requestedStart
    const boundedStart = start.isAfter(termEnd, 'day') ? termEnd : start
    const end = boundedStart
    form.setFieldsValue({
      title: '', category: 'event', dates: [end, end], audience: 'all', class_group_id: undefined, description: '',
    })
    setEventModalOpen(true)
  }

  const dateCells = useMemo(() => {
    const first = viewMonth.startOf('month')
    const start = mondayOf(first)
    return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
  }, [viewMonth])
  const visibleEvents = useMemo(() => events.filter(event => {
    if (view === 'month') return !dayjs(event.ends_on).isBefore(viewMonth.startOf('month'), 'day') && !dayjs(event.starts_on).isAfter(viewMonth.endOf('month'), 'day')
    if (view === 'week') {
      const start = mondayOf(viewMonth)
      const end = start.add(6, 'day')
      return !dayjs(event.ends_on).isBefore(start, 'day') && !dayjs(event.starts_on).isAfter(end, 'day')
    }
    return true
  }), [events, view, viewMonth])

  const upcomingEvents = useMemo(() => {
    const base = term ? dayjs(term.starts_on) : dayjs()
    const future = [...events].filter(event => !dayjs(event.ends_on).isBefore(base, 'day'))
    return (future.length ? future : [...events]).sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(0, 8)
  }, [events, termId])

  const monthOverview = useMemo(() => {
    const first = viewMonth.startOf('month')
    const count = first.daysInMonth()
    let weekdays = 0
    for (let day = 0; day < count; day += 1) {
      const date = first.add(day, 'day')
      if (date.day() !== 0 && date.day() !== 6) weekdays += 1
    }
    const holidays = new Set<string>()
    events.filter(event => event.category === 'holiday').forEach(event => {
      const from = dayjs(event.starts_on).isAfter(first) ? dayjs(event.starts_on) : first
      const last = first.endOf('month')
      const to = dayjs(event.ends_on).isBefore(last) ? dayjs(event.ends_on) : last
      for (let date = from; !date.isAfter(to, 'day'); date = date.add(1, 'day')) {
        if (date.day() !== 0 && date.day() !== 6) holidays.add(date.format('YYYY-MM-DD'))
      }
    })
    return {
      schoolDays: Math.max(0, weekdays - holidays.size),
      holidays: events.filter(event => event.category === 'holiday' && !dayjs(event.ends_on).isBefore(first, 'day') && !dayjs(event.starts_on).isAfter(first.endOf('month'), 'day')).length,
      events: events.filter(event => !dayjs(event.ends_on).isBefore(first, 'day') && !dayjs(event.starts_on).isAfter(first.endOf('month'), 'day')).length,
    }
  }, [events, viewMonth])

  const exportCsv = () => {
    const rows = [
      ['Title', 'Category', 'Start date', 'End date', 'Applies to', 'Class', 'Description'],
      ...events.map(event => [event.title, categoryLabels[event.category], event.starts_on, event.ends_on,
        categoryAudienceLabels[event.audience], event.class_name ?? '', event.description ?? '']),
    ]
    const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `academic-calendar-${year?.name.replaceAll('/', '-') ?? 'school-year'}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const changePeriodYear = (nextYearId: string) => {
    setYearId(nextYearId)
    const nextYear = years.find(item => item.id === nextYearId)
    if (nextYear) setViewMonth(dayjs(nextYear.starts_on).startOf('month'))
  }

  const renderEvent = (event: AcademicCalendarEvent, compact = false) => (
    <button type="button" key={`${event.id}-${compact ? 'chip' : 'row'}`} className={`calendar-event-chip category-${event.category} ${compact ? 'compact' : ''}`}
      onClick={e => { e.stopPropagation(); setSelectedEvent(event) }} title={`${event.title} · ${categoryLabels[event.category]}`}>
      <i aria-hidden="true"/><span>{event.title}</span>
    </button>
  )

  const periodError = eventsQuery.error ?? classesQuery.error
  const dateDisabled = (date: Dayjs) => {
    if (term && (date.isBefore(dayjs(term.starts_on), 'day') || date.isAfter(dayjs(term.ends_on), 'day'))) return true
    if (year && (date.isBefore(dayjs(year.starts_on), 'day') || date.isAfter(dayjs(year.ends_on), 'day'))) return true
    return false
  }

  return <div className="page-content academic-calendar-page">
    {toastContext}
    <div className="calendar-page-header">
      <div><div className="eyebrow">SCHOOL PLANNING</div><h1>Academic calendar</h1>
        <p className="welcome-subtitle">Plan and manage your school year in one place.</p></div>
      <div className="calendar-header-actions">
        {canEdit && <Button type="primary" icon={<PlusOutlined/>} onClick={() => openCreate()} disabled={!yearId}>Add calendar event</Button>}
        <Button icon={<DownloadOutlined/>} onClick={exportCsv} disabled={!events.length}>Export</Button>
      </div>
    </div>

    {periodError && <Alert className="calendar-page-alert" type="error" showIcon message="Could not load the academic calendar" description={formatApiError(periodError)}/>}
    {!periodLoading && !years.length && <Alert className="calendar-page-alert" type="info" showIcon message="Set up an academic year and term before adding calendar events."/>}

    <div className="calendar-dashboard-grid">
      <div className="calendar-main-column">
        <section className="calendar-period-toolbar panel">
          <span className="calendar-toolbar-icon"><CalendarOutlined/></span>
          <label><span>Academic year</span><Select value={yearId || undefined} options={years.map(item => ({ value: item.id, label: item.name }))}
            onChange={changePeriodYear} placeholder="Select year" disabled={!years.length}/></label>
          <span className="calendar-toolbar-icon calendar-term-icon"><TeamOutlined/></span>
          <label><span>Term</span><Select value={termId || undefined} options={terms.map(item => ({ value: item.id, label: item.name }))}
            onChange={setTermId} placeholder="All terms" allowClear disabled={!terms.length}/></label>
          <div className="calendar-view-switch" role="tablist" aria-label="Calendar view">
            {(['month', 'week', 'agenda'] as CalendarView[]).map(item => <button type="button" key={item}
              className={view === item ? 'selected' : ''} role="tab" aria-selected={view === item} onClick={() => setView(item)}>
              {item === 'month' ? <CalendarOutlined/> : item === 'week' ? <ClockCircleOutlined/> : <span className="agenda-icon">☷</span>}
              <span>{item[0].toUpperCase() + item.slice(1)}</span>
            </button>)}
          </div>
        </section>

        <section className="calendar-grid-panel panel">
          <div className="calendar-month-heading">
            <div className="calendar-month-label">
              <Button aria-label="Previous month" icon={<LeftOutlined/>} onClick={() => setViewMonth(value => value.subtract(1, 'month'))}/>
              <h2>{view === 'week' ? `${mondayOf(viewMonth).format('D MMM')} – ${mondayOf(viewMonth).add(6, 'day').format('D MMM YYYY')}` : viewMonth.format('MMMM YYYY')}</h2>
              <Button aria-label="Next month" icon={<RightOutlined/>} onClick={() => setViewMonth(value => value.add(1, view === 'week' ? 'week' : 'month'))}/>
            </div>
            <Button className="calendar-today-button" onClick={() => setViewMonth(dayjs().startOf('month'))}>Today</Button>
          </div>

          {view === 'month' && <div className="calendar-month-grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="calendar-weekday">{day}</div>)}
            {dateCells.map(date => {
              const dayEvents = events.filter(event => eventOccursOn(event, date))
              return <div role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined} key={date.format('YYYY-MM-DD')} className={`calendar-day-cell ${date.month() !== viewMonth.month() ? 'outside-month' : ''} ${date.isSame(dayjs(), 'day') ? 'today' : ''}`}
                onClick={canEdit ? () => openCreate(date) : undefined} onKeyDown={canEdit ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCreate(date) } } : undefined} aria-label={`${date.format('D MMMM YYYY')}; ${dayEvents.length} events`}>
                <span className="calendar-day-number">{date.date()}</span>
                <span className="calendar-day-events">
                  {dayEvents.slice(0, 3).map(event => renderEvent(event, true))}
                  {dayEvents.length > 3 && <small className="calendar-more-events">+{dayEvents.length - 3} more</small>}
                </span>
              </div>
            })}
          </div>}

          {view === 'week' && <div className="calendar-week-grid">
            {Array.from({ length: 7 }, (_, index) => mondayOf(viewMonth).add(index, 'day')).map(date => {
              const dayEvents = events.filter(event => eventOccursOn(event, date))
              return <section className={`calendar-week-day ${date.isSame(dayjs(), 'day') ? 'today' : ''}`} key={date.format('YYYY-MM-DD')}>
                <header><span>{date.format('ddd')}</span><strong>{date.format('D')}</strong></header>
                <div>{dayEvents.length ? dayEvents.map(event => renderEvent(event)) : <span className="calendar-empty-day">No events</span>}</div>
                {canEdit && <Button type="text" icon={<PlusOutlined/>} aria-label={`Add event on ${date.format('D MMM')}`} onClick={() => openCreate(date)}/>}
              </section>
            })}
          </div>}

          {view === 'agenda' && <div className="calendar-agenda-list">
            {visibleEvents.length ? visibleEvents.map(event => <button type="button" className="calendar-agenda-row" key={event.id} onClick={() => setSelectedEvent(event)}>
              <span className={`calendar-agenda-date category-${event.category}`}><strong>{dayjs(event.starts_on).format('DD')}</strong><small>{dayjs(event.starts_on).format('MMM')}</small></span>
              <span className="calendar-agenda-copy"><strong>{event.title}</strong><small>{categoryLabels[event.category]} · {categoryAudienceLabels[event.audience]}{event.class_name ? ` · ${event.class_name}` : ''}</small></span>
              <span className="calendar-agenda-range">{event.starts_on === event.ends_on ? dayjs(event.starts_on).format('D MMM YYYY') : `${dayjs(event.starts_on).format('D MMM')} – ${dayjs(event.ends_on).format('D MMM YYYY')}`}</span>
              <RightOutlined/>
            </button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No events in this academic period"/>}
          </div>}

          {eventsQuery.isLoading && <div className="calendar-loading"><Spin size="small"/> Loading events…</div>}
        </section>
      </div>

      <aside className="calendar-side-column">
        <section className="calendar-upcoming panel">
          <div className="calendar-side-heading"><div><h2>Upcoming events</h2><p>{term?.name ?? year?.name ?? 'Selected period'}</p></div>
            <Button type="link" onClick={() => setView('agenda')}>View all <RightOutlined/></Button></div>
          {eventsQuery.isLoading ? <div className="calendar-loading"><Spin size="small"/> Loading…</div>
            : upcomingEvents.length ? <div className="calendar-upcoming-list">{upcomingEvents.map(event => <button type="button" key={event.id} className="calendar-upcoming-row" onClick={() => setSelectedEvent(event)}>
              <span className="calendar-date-stack"><small>{dayjs(event.starts_on).format('MMM')}</small><strong>{dayjs(event.starts_on).format('D')}</strong></span>
              <i className={`category-dot category-${event.category}`}/>
              <span className="calendar-upcoming-copy"><strong>{event.title}</strong><small>{categoryAudienceLabels[event.audience]}{event.class_name ? ` · ${event.class_name}` : ''}</small></span>
            </button>)}</div>
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={canEdit ? <span>No calendar events yet<br/><Button type="link" size="small" loading={seedMutation.isPending} disabled={!termId} onClick={() => seedMutation.mutate()}>Add sample events</Button></span> : 'No calendar events yet'}/>}
        </section>

        <section className="calendar-overview panel">
          <div className="calendar-side-heading"><div><h2>Calendar overview</h2><p>{viewMonth.format('MMMM YYYY')}</p></div></div>
          <div className="calendar-overview-cards">
            <div><span className="overview-card-icon blue"><CalendarOutlined/></span><small>School days</small><strong>{monthOverview.schoolDays}</strong><span>This month</span></div>
            <div><span className="overview-card-icon green"><span>✦</span></span><small>Holidays</small><strong>{monthOverview.holidays}</strong><span>This month</span></div>
            <div><span className="overview-card-icon orange"><ClockCircleOutlined/></span><small>Events</small><strong>{monthOverview.events}</strong><span>This month</span></div>
          </div>
        </section>
        <section className="calendar-legend panel">
          <h2>Event categories</h2><div>{categories.filter(item => ['term', 'holiday', 'exam', 'meeting', 'event', 'assessment'].includes(item.value)).map(item => <span key={item.value}><i className={`category-dot category-${item.value}`}/>{item.label}</span>)}</div>
        </section>
      </aside>
    </div>

    <Modal className="academic-event-modal" title={null} open={eventModalOpen} onCancel={() => setEventModalOpen(false)} footer={null} destroyOnHidden>
      <div className="calendar-modal-heading"><span className="calendar-modal-icon"><CalendarOutlined/></span><div><h2>Add academic event</h2><p>{year?.name}{term ? ` · ${term.name}` : ''}</p></div><button type="button" aria-label="Close" onClick={() => setEventModalOpen(false)}>×</button></div>
      {createMutation.isError && <Alert className="calendar-modal-alert" type="error" showIcon message={formatApiError(createMutation.error)}/>}
      <Form form={form} layout="vertical" onFinish={values => createMutation.mutate(values)} requiredMark="optional">
        <Form.Item name="title" label="Event title" rules={[{ required: true, whitespace: true, message: 'Enter an event title' }, { max: 160, message: 'Maximum 160 characters' }]}>
          <Input maxLength={160} placeholder="e.g. Parent-teacher meeting" />
        </Form.Item>
        <Form.Item name="category" label="Category" rules={[{ required: true }]}>
          <Select options={categories.map(item => ({ value: item.value, label: <span className="calendar-category-option"><i className={`category-dot category-${item.value}`}/>{item.label}</span> }))}/>
        </Form.Item>
        <div className="calendar-date-form-row">
          <Form.Item name="dates" label="Start and end date" rules={[{ required: true, message: 'Choose the event dates' }]}>
            <DatePicker.RangePicker format="D MMM YYYY" disabledDate={dateDisabled} allowClear={false}/>
          </Form.Item>
        </div>
        <Form.Item name="audience" label="Applies to" rules={[{ required: true }]}>
          <Select options={audiences.map(item => ({ value: item.value, label: item.label }))}/>
        </Form.Item>
        {audience === 'class' && <Form.Item name="class_group_id" label="Class group" rules={[{ required: true, message: 'Choose a class group' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Select class" options={classes.map(item => ({ value: item.id, label: item.name }))}/>
        </Form.Item>}
        <Form.Item name="description" label="Description (optional)">
          <Input.TextArea rows={3} maxLength={2000} showCount placeholder="Add useful details for students, families, or staff."/>
        </Form.Item>
        <div className="calendar-modal-footer"><Button onClick={() => setEventModalOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={createMutation.isPending}>Save event</Button></div>
      </Form>
    </Modal>

    <Drawer title="Calendar event" open={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)} width={420} destroyOnHidden>
      {selectedEvent && <div className="calendar-event-detail">
        <Tag bordered={false} className={`calendar-detail-tag category-${selectedEvent.category}`}>{categoryLabels[selectedEvent.category]}</Tag>
        <h2>{selectedEvent.title}</h2>
        <p className="calendar-event-detail-dates"><CalendarOutlined/> {selectedEvent.starts_on === selectedEvent.ends_on
          ? dayjs(selectedEvent.starts_on).format('dddd, D MMMM YYYY')
          : `${dayjs(selectedEvent.starts_on).format('D MMM YYYY')} – ${dayjs(selectedEvent.ends_on).format('D MMM YYYY')}`}</p>
        <Descriptions column={1} size="small" items={[
          { key: 'year', label: 'Academic year', children: year?.name ?? '—' },
          { key: 'term', label: 'Term', children: terms.find(item => item.id === selectedEvent.term_id)?.name ?? 'All year' },
          { key: 'audience', label: 'Applies to', children: selectedEvent.class_name ?? categoryAudienceLabels[selectedEvent.audience] },
          ...(selectedEvent.description ? [{ key: 'description', label: 'Description', children: selectedEvent.description }] : []),
        ]}/>
        {canEdit && <div className="calendar-detail-actions"><Popconfirm title="Delete this event?" description="This event will be removed from the school calendar." okText="Delete" cancelText="Keep" okButtonProps={{ danger: true }} onConfirm={() => deleteMutation.mutate(selectedEvent.id)}>
          <Button danger icon={<DeleteOutlined/>} loading={deleteMutation.isPending}>Delete event</Button>
        </Popconfirm></div>}
      </div>}
    </Drawer>
  </div>
}
