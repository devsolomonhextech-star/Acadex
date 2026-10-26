import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Empty, Select, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, CalendarOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { TimetableSlot } from '../../shared/api/types'
import { fetchAcademicYears } from './academicApi'
import { fetchTimetable } from './timetableApi'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function TeacherTimetablePage() {
  const { accessToken, user } = useAuth()
  const { yearId: selectedYearId, setYearId } = useAcademicPeriod()
  const yearsQuery = useQuery({
    queryKey: ['academic-years', user?.school_id],
    queryFn: () => fetchAcademicYears(accessToken!),
    enabled: !!accessToken,
  })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === selectedYearId) ? selectedYearId : years[0]?.id ?? ''
  const timetableQuery = useQuery({
    queryKey: ['teacher-timetable', user?.school_id, yearId],
    queryFn: () => fetchTimetable(accessToken!, yearId),
    enabled: !!accessToken && !!yearId,
  })
  const lessonsByDay = useMemo(() => {
    const days: TimetableSlot[][] = DAYS.map(() => [])
    for (const slot of timetableQuery.data ?? []) days[slot.day_of_week]?.push(slot)
    return days
  }, [timetableQuery.data])
  const error = yearsQuery.error ?? timetableQuery.error

  return <div className="page-content teacher-timetable-page">
    <div className="teacher-timetable-heading">
      <div><div className="eyebrow">TEACHING SCHEDULE</div><h1>My timetable</h1><p>Your weekly lessons, classes and rooms.</p></div>
      <div className="teacher-timetable-actions"><Select aria-label="Academic year" value={yearId || undefined} onChange={setYearId} options={years.map(year => ({ value: year.id, label: year.name }))} placeholder="Select academic year" disabled={!years.length} />
        <Link to="/"><Button icon={<ArrowLeftOutlined />}>Back to dashboard</Button></Link></div>
    </div>
    {error && <Alert type="error" showIcon message="Could not load your timetable" description={formatApiError(error)} action={<Button size="small" onClick={() => { void yearsQuery.refetch(); void timetableQuery.refetch() }}>Retry</Button>} />}
    {(yearsQuery.isLoading || timetableQuery.isLoading) ? <div className="attendance-loading"><Spin size="large" /><span>Loading your timetable…</span></div> : !yearId ? <Card className="teacher-timetable-empty"><Empty description="No academic year has been set up yet" /></Card> : !(timetableQuery.data?.length) ? <Card className="teacher-timetable-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lessons are scheduled for you in this academic year" /></Card> : <div className="teacher-week-grid">{DAYS.map((day, index) => <section className="teacher-day-column" key={day}>
      <header><CalendarOutlined /><b>{day}</b><Tag>{lessonsByDay[index].length}</Tag></header>
      {lessonsByDay[index].length ? lessonsByDay[index].map(slot => <Card className="teacher-week-lesson" key={slot.id} bordered={false}>
        <div className="teacher-week-lesson-time"><ClockCircleOutlined /> {slot.starts_at}–{slot.ends_at}</div><b>{slot.subject_name}</b><span>{slot.class_name}</span>{slot.room && <small>Room {slot.room}</small>}
      </Card>) : <div className="teacher-no-lessons">No lessons</div>}
    </section>)}</div>}
  </div>
}
