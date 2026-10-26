import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Empty, Progress, Spin, Tag } from 'antd'
import { AlertOutlined, BookOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { OverviewLesson, SchoolUser, TeacherDashboard as TeacherDashboardData } from '../../shared/api/types'
import { fetchTeacherDashboard } from './overviewApi'

function timeMinutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m }
function lessonState(lesson: OverviewLesson, now: Date) {
  const minute = now.getHours() * 60 + now.getMinutes()
  if (minute < timeMinutes(lesson.starts_at)) return { label: `In ${timeMinutes(lesson.starts_at) - minute} min`, state: 'next' }
  if (minute < timeMinutes(lesson.ends_at)) return { label: `In progress · ${timeMinutes(lesson.ends_at) - minute} min left`, state: 'live' }
  return { label: 'Completed', state: 'done' }
}
function firstName(name: string) { return name.trim().split(/\s+/)[0] || 'Teacher' }

export default function TeacherDashboard({ user }: { user: SchoolUser }) {
  const { accessToken } = useAuth()
  const { yearId, termId, loading } = useAcademicPeriod()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer) }, [])
  const query = useQuery({
    queryKey: ['teacher-dashboard', user.school_id, yearId, termId],
    queryFn: () => fetchTeacherDashboard(accessToken!, yearId, termId),
    enabled: !!accessToken && !loading,
    refetchInterval: 60_000,
  })
  if (query.isLoading) return <div className="page-content"><div className="attendance-loading"><Spin size="large" /><span>Loading your teaching dashboard…</span></div></div>
  if (query.isError) return <div className="page-content"><Alert type="error" showIcon message="Could not load your teaching dashboard" description={formatApiError(query.error)} action={<Button size="small" onClick={() => void query.refetch()}>Retry</Button>} /></div>
  const data = query.data as TeacherDashboardData | undefined
  if (!data) return null
  const lessons = data.lessons_today
  const upcoming = lessons.find(item => lessonState(item, now).state !== 'done')
  const timeLabel = now.toLocaleTimeString('en-GH', { hour: 'numeric', minute: '2-digit' })
  const stats = [
    { label: 'My classes', value: data.classes.length, note: 'Assigned this academic year', icon: <BookOutlined />, color: 'blue' },
    { label: 'Students in my classes', value: data.students_total, note: 'Across your assigned classes', icon: <TeamOutlined />, color: 'violet' },
    { label: 'Attendance marked', value: `${data.attendance_marked}/${data.attendance_total}`, note: data.attendance_total ? `${Math.round(data.attendance_marked * 100 / data.attendance_total)}% recorded today` : 'No class lists yet', icon: <CalendarOutlined />, color: 'green' },
    { label: 'Needs attention', value: data.overdue_submissions + data.recent_behavior_records, note: `${data.overdue_submissions} overdue submissions · ${data.recent_behavior_records} recent behaviour records`, icon: <AlertOutlined />, color: 'orange' },
  ]
  return <div className="page-content teacher-dashboard">
    <div className="teacher-welcome">
      <div><div className="eyebrow">TEACHER OVERVIEW <span className="live-dot" /> <span className="term-label">{data.current_term?.name.toUpperCase() ?? 'ACADEMIC OVERVIEW'}</span></div>
        <h1>Welcome, {firstName(user.display_name)}</h1>
        <p>Here’s your class activity, attendance and teaching schedule for today.</p>
        <div className="teacher-context">{user.school_name} <span>·</span> {data.academic_year ?? 'No academic year selected'} <span>·</span> Updated {timeLabel}</div>
      </div>
      <Link to="/timetable"><Button icon={<CalendarOutlined />}>View timetable</Button></Link>
    </div>
    <div className="teacher-stat-grid">{stats.map(stat => <Card key={stat.label} className="teacher-stat-card" bordered={false}>
      <div className={`teacher-stat-icon ${stat.color}`}>{stat.icon}</div><div className="teacher-stat-label">{stat.label}</div><strong>{stat.value}</strong><small>{stat.note}</small>
    </Card>)}</div>
    <div className="teacher-main-grid">
      <section className="teacher-panel teacher-schedule-panel">
        <div className="teacher-panel-heading"><div><span className="teacher-panel-icon"><ClockCircleOutlined /></span><div><h2>Today’s timetable</h2><p>Your lessons, in time order</p></div></div><Tag color="blue">{lessons.length} lessons</Tag></div>
        {upcoming ? <div className="teacher-next-lesson"><div><span>NEXT LESSON</span><b>{upcoming.subject_name}</b><small>{upcoming.class_name}{upcoming.room ? ` · Room ${upcoming.room}` : ''}</small></div><div className={`teacher-countdown ${lessonState(upcoming, now).state}`}>{lessonState(upcoming, now).label}<small>{upcoming.starts_at}–{upcoming.ends_at}</small></div></div> : null}
        {lessons.length ? <div className="teacher-timeline">{lessons.map(lesson => { const status = lessonState(lesson, now); return <div className={`teacher-timeline-row ${status.state}`} key={lesson.id}>
          <div className="teacher-lesson-time">{lesson.starts_at}<small>{lesson.ends_at}</small></div><div className="teacher-lesson-marker" /><div className="teacher-lesson-copy"><b>{lesson.subject_name}</b><span>{lesson.class_name}{lesson.room ? ` · Room ${lesson.room}` : ''}</span></div><Tag color={status.state === 'live' ? 'green' : status.state === 'next' ? 'blue' : 'default'}>{status.label}</Tag>
        </div> })}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lessons scheduled for today" />}
      </section>
      <section className="teacher-panel teacher-focus-panel">
        <div className="teacher-panel-heading"><div><span className="teacher-panel-icon"><AlertOutlined /></span><div><h2>Class pulse</h2><p>Upcoming work and follow-ups</p></div></div></div>
        <div className="teacher-focus-metric"><div><strong>{data.upcoming_assessments}</strong><span>Assessments due in the next 7 days</span></div><BookOutlined /></div>
        <div className="teacher-focus-metric"><div><strong>{data.overdue_submissions}</strong><span>Overdue student submissions</span></div><ClockCircleOutlined /></div>
        <div className="teacher-focus-metric"><div><strong>{data.recent_behavior_records}</strong><span>Behaviour records in the last 14 days</span></div><AlertOutlined /></div>
        <p className="teacher-focus-note">Use these indicators to check in with students and coordinate support with your school team.</p>
      </section>
    </div>
    <section className="teacher-panel teacher-classes-panel">
      <div className="teacher-panel-heading"><div><span className="teacher-panel-icon"><TeamOutlined /></span><div><h2>My classes</h2><p>Class-by-class snapshot of what’s happening</p></div></div><span className="teacher-updated">Live · refreshes every minute</span></div>
      {data.classes.length ? <div className="teacher-class-grid">{data.classes.map(group => <Card key={group.id} className="teacher-class-card" bordered={false}>
        <div className="teacher-class-title"><div><b>{group.name}</b><span>{group.grade_level}{group.stream ? ` · ${group.stream}` : ''}</span></div>{group.is_class_teacher && <Tag color="blue">Class teacher</Tag>}</div>
        <div className="teacher-subjects">{group.subjects.length ? group.subjects.map(subject => <Tag key={subject}>{subject}</Tag>) : <span>Class teacher</span>}</div>
        <div className="teacher-attendance-line"><span>Today’s attendance</span><b>{group.attendance_rate == null ? 'Not recorded' : `${group.attendance_rate}%`}</b></div>
        <Progress percent={group.attendance_rate ?? 0} showInfo={false} strokeColor={group.attendance_rate == null ? '#e7eaf0' : group.attendance_rate >= 85 ? '#19b982' : '#f2a83b'} />
        <div className="teacher-class-counts"><span><b>{group.present + group.late}</b> present</span><span><b>{group.absent}</b> absent</span><span><b>{group.unmarked}</b> unmarked</span></div>
        <div className="teacher-class-footer"><span>{group.students_total} students</span><span>{group.upcoming_assessments} upcoming assessments</span></div>
      </Card>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classes are assigned to you for this academic year" />}
    </section>
  </div>
}
