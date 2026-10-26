import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Avatar, Button, Card, Empty, Select, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { ClassGroup, TimetableSlot } from '../../shared/api/types'
import { fetchAcademicYears, fetchClassGroups } from './academicApi'
import { fetchTimetable } from './timetableApi'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function TeacherTimetablePage() {
  const { accessToken, user } = useAuth()
  const [selectedClassId, setSelectedClassId] = useState('')
  const { yearId: selectedYearId, setYearId } = useAcademicPeriod()
  const yearsQuery = useQuery({
    queryKey: ['academic-years', user?.school_id],
    queryFn: () => fetchAcademicYears(accessToken!),
    enabled: !!accessToken,
  })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === selectedYearId) ? selectedYearId : years[0]?.id ?? ''
  const classesQuery = useQuery({
    queryKey: ['teacher-class-groups', user?.school_id, yearId],
    queryFn: () => fetchClassGroups(accessToken!, yearId),
    enabled: !!accessToken && !!yearId,
  })
  const classes = classesQuery.data ?? []
  const classId = classes.some(group => group.id === selectedClassId) ? selectedClassId : ''
  const timetableQuery = useQuery({
    queryKey: ['teacher-timetable', user?.school_id, yearId, classId],
    queryFn: () => fetchTimetable(accessToken!, yearId, classId || undefined),
    enabled: !!accessToken && !!yearId,
  })
  const lessonsByDay = useMemo(() => {
    const days: TimetableSlot[][] = DAYS.map(() => [])
    for (const slot of timetableQuery.data ?? []) days[slot.day_of_week]?.push(slot)
    return days
  }, [timetableQuery.data])
  const error = yearsQuery.error ?? classesQuery.error ?? timetableQuery.error
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const avatarColor = (name: string) => ['#5b79ec', '#19a989', '#e38a50', '#8865d6', '#d5657d', '#278ca8'][[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6]

  return <div className="page-content teacher-timetable-page">
    <div className="teacher-timetable-heading">
      <div><div className="eyebrow">TEACHING SCHEDULE</div><h1>My timetable</h1><p>Your weekly lessons, classes and rooms.</p></div>
      <div className="teacher-timetable-actions"><Select aria-label="Academic year" value={yearId || undefined} onChange={value => { setYearId(value); setSelectedClassId('') }} options={years.map(year => ({ value: year.id, label: year.name }))} placeholder="Select academic year" disabled={!years.length} />
        <Select aria-label="Class timetable" value={classId || undefined} onChange={value => setSelectedClassId(value ?? '')} allowClear placeholder="All my classes" options={classes.map((group: ClassGroup) => ({ value: group.id, label: group.name }))} disabled={!classes.length} />
        <Link to="/"><Button icon={<ArrowLeftOutlined />}>Back to dashboard</Button></Link></div>
    </div>
    {error && <Alert type="error" showIcon message="Could not load your timetable" description={formatApiError(error)} action={<Button size="small" onClick={() => { void yearsQuery.refetch(); void timetableQuery.refetch() }}>Retry</Button>} />}
    {(yearsQuery.isLoading || timetableQuery.isLoading) ? <div className="attendance-loading"><Spin size="large" /><span>Loading your timetable…</span></div> : !yearId ? <Card className="teacher-timetable-empty"><Empty description="No academic year has been set up yet" /></Card> : !(timetableQuery.data?.length) ? <Card className="teacher-timetable-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lessons are scheduled for you in this academic year" /></Card> : <div className="teacher-week-grid">{DAYS.map((day, index) => <section className="teacher-day-column" key={day}>
      <header><CalendarOutlined /><b>{day}</b><Tag>{lessonsByDay[index].length}</Tag></header>
      {lessonsByDay[index].length ? lessonsByDay[index].map(slot => <Card className="teacher-week-lesson" key={slot.id} bordered={false}>
        <div className="teacher-week-lesson-time"><ClockCircleOutlined /> {slot.starts_at}–{slot.ends_at}</div><b>{slot.subject_name}</b><span>{slot.class_name}</span><div className="teacher-week-teacher"><Avatar size={23} style={{ backgroundColor: avatarColor(slot.teacher_name), fontSize: 9, fontWeight: 700 }}>{initials(slot.teacher_name)}</Avatar><small>{slot.teacher_name}</small></div>{slot.room && <small>Room {slot.room}</small>}
      </Card>) : <div className="teacher-no-lessons">No lessons</div>}
    </section>)}</div>}
  </div>
}
