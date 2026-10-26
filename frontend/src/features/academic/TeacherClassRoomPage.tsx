import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Empty, Input, Progress, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { ClassGroup, ClassRosterStudent, TimetableSlot } from '../../shared/api/types'
import { fetchAcademicYears, fetchClassGroups, fetchClassRoster } from './academicApi'
import { fetchTimetable } from './timetableApi'
import { fetchTeacherDashboard } from '../overview/overviewApi'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const minutes = (time: string) => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }
function gapType(from: number, to: number): 'break' | 'lunch' | 'free' {
  if (from >= 11 * 60 && from < 14 * 60 && to - from >= 25) return 'lunch'
  if (to - from >= 10 && to - from <= 35) return 'break'
  return 'free'
}
function countdown(start: string, now: Date) {
  const startAt = new Date(); const [hour, minute] = start.split(':').map(Number); startAt.setHours(hour, minute, 0, 0)
  const diff = Math.ceil((startAt.getTime() - now.getTime()) / 60_000)
  if (diff <= 0) return 'Starting now'
  if (diff >= 60) return `In ${Math.floor(diff / 60)}h ${diff % 60}m`
  return `In ${diff} min`
}

export default function TeacherClassRoomPage() {
  const { classGroupId = '' } = useParams()
  const { accessToken, user } = useAuth()
  const { yearId: periodYearId, termId } = useAcademicPeriod()
  const [search, setSearch] = useState('')
  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some(item => item.id === periodYearId) ? periodYearId : years[0]?.id ?? ''
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const group = (classesQuery.data ?? []).find(item => item.id === classGroupId) as ClassGroup | undefined
  const rosterQuery = useQuery({ queryKey: ['teacher-class-roster', user?.school_id, classGroupId], queryFn: () => fetchClassRoster(accessToken!, classGroupId), enabled: !!accessToken && !!classGroupId })
  const timetableQuery = useQuery({ queryKey: ['teacher-class-timetable', user?.school_id, yearId, classGroupId], queryFn: () => fetchTimetable(accessToken!, yearId, classGroupId), enabled: !!accessToken && !!yearId && !!classGroupId })
  const dashboardQuery = useQuery({ queryKey: ['teacher-dashboard', user?.school_id, yearId, termId], queryFn: () => fetchTeacherDashboard(accessToken!, yearId, termId), enabled: !!accessToken && !!yearId, refetchInterval: 60_000 })
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const students = rosterQuery.data ?? []
  const filteredStudents = students.filter(student => `${student.first_name} ${student.last_name} ${student.admission_number}`.toLowerCase().includes(search.toLowerCase()))
  const classSummary = dashboardQuery.data?.classes.find(item => item.id === classGroupId)
  const week = useMemo(() => {
    const byDay: { lesson?: TimetableSlot; kind?: 'break' | 'lunch' | 'free'; from?: string; to?: string }[][] = DAYS.map(() => [])
    const source = timetableQuery.data ?? []
    DAYS.forEach((_, dayIndex) => {
      const dayLessons = source.filter(slot => slot.day_of_week === dayIndex).sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at))
      dayLessons.forEach((lesson, index) => {
        if (index > 0) {
          const previous = dayLessons[index - 1]
          const from = minutes(previous.ends_at); const to = minutes(lesson.starts_at)
          if (to - from >= 10) byDay[dayIndex].push({ kind: gapType(from, to), from: previous.ends_at, to: lesson.starts_at })
        }
        byDay[dayIndex].push({ lesson })
      })
    })
    return byDay
  }, [timetableQuery.data])
  const todayLessons = (timetableQuery.data ?? []).filter(item => item.day_of_week === now.getDay() - 1).sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at))
  const nextLesson = todayLessons.find(item => minutes(item.starts_at) > now.getHours() * 60 + now.getMinutes())
  const pageError = yearsQuery.error ?? classesQuery.error ?? rosterQuery.error ?? timetableQuery.error
  const columns: TableColumnsType<ClassRosterStudent> = [
    { title: 'STUDENT', key: 'student', render: (_, student) => <Link className="teacher-roster-student" to={`/students/${student.id}`}><span className="teacher-student-avatar">{student.first_name[0]}{student.last_name[0]}</span><span><b>{student.first_name} {student.last_name}</b><small>{student.admission_number}</small></span></Link> },
    { title: 'GENDER', dataIndex: 'gender', key: 'gender', render: (value: string | null) => value ? value[0].toUpperCase() + value.slice(1) : '—' },
    { title: 'ENROLLED', dataIndex: 'enrolled_on', key: 'enrolled', render: (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color="green">{value}</Tag> },
    { title: '', key: 'action', render: (_, student) => <Link to={`/students/${student.id}`}><Button size="small">View profile</Button></Link> },
  ]

  if (yearsQuery.isLoading || classesQuery.isLoading) return <div className="page-content"><div className="attendance-loading"><Spin size="large" /><span>Opening your class room…</span></div></div>
  if (pageError) return <div className="page-content"><Alert type="error" showIcon message="Could not open this class room" description={formatApiError(pageError)} /></div>
  if (!group) return <div className="page-content"><Alert type="warning" showIcon message="Class not found for the selected academic year" action={<Link to="/"><Button size="small">Back to dashboard</Button></Link>} /></div>

  return <div className="page-content teacher-room-page">
    <div className="teacher-room-heading"><div><Link to="/" className="teacher-room-back"><ArrowLeftOutlined /> My dashboard</Link><div className="eyebrow">CLASS ROOM <span className="live-dot" /></div><h1>{group.name}</h1><p>{group.grade_level}{group.stream ? ` · ${group.stream}` : ''} <span>·</span> {years.find(item => item.id === yearId)?.name}</p></div><div className="teacher-room-actions"><Tag color="blue">{classSummary?.is_class_teacher ? 'Class teacher' : 'Subject teacher'}</Tag><Link to="/timetable"><Button icon={<CalendarOutlined />}>My full timetable</Button></Link></div></div>
    {nextLesson && <div className="teacher-room-next"><span className="teacher-room-next-icon"><ClockCircleOutlined /></span><div><small>NEXT CLASS LESSON</small><b>{nextLesson.subject_name} · {nextLesson.starts_at}</b><span>{nextLesson.room ? `Room ${nextLesson.room} · ` : ''}{nextLesson.teacher_name}</span></div><strong>{countdown(nextLesson.starts_at, now)}</strong></div>}
    <div className="teacher-room-stats"><Card><TeamOutlined /><span>Students</span><b>{students.length}</b></Card><Card><CalendarOutlined /><span>Attendance today</span><b>{classSummary?.attendance_rate == null ? 'Not marked' : `${classSummary.attendance_rate}%`}</b>{classSummary?.attendance_rate != null && <Progress percent={classSummary.attendance_rate} showInfo={false} />}</Card><Card><ClockCircleOutlined /><span>Lessons this week</span><b>{timetableQuery.data?.length ?? 0}</b></Card></div>
    <section className="teacher-room-panel"><div className="teacher-room-section-heading"><div><h2>Class timetable</h2><p>Weekly schedule · gaps between lessons are marked as break, lunch or free period.</p></div><span className="teacher-timetable-legend"><i className="lesson" /> Lesson <i className="break" /> Break <i className="lunch" /> Lunch</span></div>
      {timetableQuery.isLoading ? <Spin /> : !(timetableQuery.data?.length) ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No class lessons have been added yet" /> : <div className="teacher-room-week">{DAYS.map((day, index) => <div className="teacher-room-day" key={day}><header><b>{day}</b><Tag>{week[index].filter(item => item.lesson).length}</Tag></header>{week[index].length ? week[index].map((entry, entryIndex) => entry.lesson ? <article className="teacher-calendar-event" key={entry.lesson.id}><small>{entry.lesson.starts_at}–{entry.lesson.ends_at}</small><b>{entry.lesson.subject_name}</b><span>{entry.lesson.teacher_name}{entry.lesson.room ? ` · ${entry.lesson.room}` : ''}</span></article> : <div className={`teacher-calendar-gap ${entry.kind}`} key={`${day}-gap-${entryIndex}`}><small>{entry.from}–{entry.to}</small><b>{entry.kind === 'lunch' ? 'Lunch' : entry.kind === 'break' ? 'Break' : 'Free period'}</b></div>) : <span className="teacher-room-no-lessons">No lessons</span>}</div>)}</div>}
    </section>
    <section className="teacher-room-panel teacher-roster-panel"><div className="teacher-room-section-heading"><div><h2>Students in {group.name}</h2><p>Open a student profile to review their learning and attendance details.</p></div><Input allowClear prefix={<SearchOutlined />} placeholder="Find a student" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <Table<ClassRosterStudent> rowKey="id" columns={columns} dataSource={filteredStudents} loading={rosterQuery.isLoading} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No student matches your search' : 'No active students are enrolled in this class'} /> }} />
    </section>
  </div>
}
