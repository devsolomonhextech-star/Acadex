import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { Alert, Button, DatePicker, Empty, Input, Select, Spin, Tag, message } from 'antd'
import { CheckOutlined, CalendarOutlined, SaveOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { fetchAcademicYears, fetchClassGroups } from '../academic/academicApi'
import { fetchAttendanceSheet, saveAttendanceSheet } from './attendanceApi'
import type { AttendanceStatus } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'

type Draft = { status: AttendanceStatus; note: string }
const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'unmarked', label: 'Select status' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
]

export default function AttendancePage() {
  const { accessToken, user } = useAuth()
  const { yearId: periodYearId, term: periodTerm, setYearId: setPeriodYearId } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [selectedClass, setSelectedClass] = useState('')
  const [attendanceDay, setAttendanceDay] = useState<Dayjs>(dayjs())
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === periodYearId) ? periodYearId : years[0]?.id ?? ''
  const classesQuery = useQuery({ queryKey: ['attendance-classes', user?.school_id, yearId, user?.role], queryFn: () => fetchClassGroups(accessToken!, yearId, user?.role === 'teacher'), enabled: !!accessToken && !!yearId })
  const classes = classesQuery.data ?? []
  const classId = classes.some(group => group.id === selectedClass) ? selectedClass : classes[0]?.id ?? ''
  const sheetQuery = useQuery({
    queryKey: ['attendance-sheet', user?.school_id, classId, attendanceDay.format('YYYY-MM-DD')],
    queryFn: () => fetchAttendanceSheet(accessToken!, classId, attendanceDay.format('YYYY-MM-DD')),
    enabled: !!accessToken && !!classId,
  })
  useEffect(() => {
    if (!sheetQuery.data) return
    setDraft(Object.fromEntries(sheetQuery.data.students.map(student => [student.student_id, {
      status: student.status, note: student.note ?? '',
    }])))
  }, [sheetQuery.data])
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!accessToken || !sheetQuery.data) throw new Error('Choose a class with an active roster first')
      return saveAttendanceSheet(accessToken, {
        class_group_id: classId,
        attendance_date: attendanceDay.format('YYYY-MM-DD'),
        marks: sheetQuery.data.students.map(student => {
          const item = draft[student.student_id]
          if (!item || item.status === 'unmarked') throw new Error(`Choose an attendance status for ${student.first_name} ${student.last_name}`)
          return { student_id: student.student_id, status: item.status, note: item.note.trim() || null }
        }),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance-sheet', user?.school_id, classId, attendanceDay.format('YYYY-MM-DD')] })
      toast.success('Attendance saved. Changes are recorded in the audit trail.')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const roster = sheetQuery.data?.students ?? []
  const totals = useMemo(() => roster.reduce((counts, student) => {
    const value = draft[student.student_id]?.status ?? student.status
    if (value in counts) counts[value as keyof typeof counts] += 1
    return counts
  }, { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }), [draft, roster])
  const selectedYearRow = years.find(year => year.id === yearId)
  useEffect(() => {
    if (!periodTerm) return
    if (attendanceDay.isBefore(dayjs(periodTerm.starts_on), 'day') || attendanceDay.isAfter(dayjs(periodTerm.ends_on), 'day')) {
      setAttendanceDay(dayjs(periodTerm.starts_on))
    }
  }, [periodTerm?.id])
  const pageError = yearsQuery.error ?? classesQuery.error ?? sheetQuery.error
  const setStudent = (id: string, field: keyof Draft, value: string) => setDraft(current => ({
    ...current, [id]: { ...(current[id] ?? { status: 'unmarked', note: '' }), [field]: value },
  }))
  const bulkPresent = () => setDraft(current => Object.fromEntries(roster.map(student => [student.student_id, {
    ...(current[student.student_id] ?? { note: '' }), status: 'present',
  }])))

  return <div className="page-content attendance-page">
    {contextHolder}
    <div className="eyebrow">CLASSROOM OPERATIONS</div>
    <div className="students-heading"><div><h1>Daily attendance</h1><p>{user?.role === 'teacher' ? 'Only the designated class teacher can record attendance for a class.' : 'Record and review attendance for the students in each class.'}</p></div></div>
    {pageError && <Alert type="error" showIcon message="Could not load the attendance sheet" description={formatApiError(pageError)} className="student-error"/>}
    <section className="attendance-controls panel">
      <div className="attendance-filter"><span>Academic year</span><Select value={yearId || undefined} placeholder="Choose academic year" onChange={value => {
        setPeriodYearId(value); setSelectedClass('')
        const year = years.find(item => item.id === value)
        if (year && (attendanceDay.isBefore(dayjs(year.starts_on), 'day') || attendanceDay.isAfter(dayjs(year.ends_on), 'day'))) setAttendanceDay(dayjs(year.starts_on))
      }} options={years.map(year => ({ value: year.id, label: year.name }))} disabled={!years.length}/></div>
      <div className="attendance-filter"><span>Class group</span><Select value={classId || undefined} placeholder="Choose class" onChange={setSelectedClass} options={classes.map(group => ({ value: group.id, label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}` }))} disabled={!classes.length}/></div>
      <div className="attendance-filter attendance-date"><span>Attendance date</span><DatePicker value={attendanceDay} format="D MMM YYYY" onChange={value => value && setAttendanceDay(value)} disabledDate={value => {
        if (value.isAfter(dayjs(), 'day')) return true
        if (periodTerm && (value.isBefore(dayjs(periodTerm.starts_on), 'day') || value.isAfter(dayjs(periodTerm.ends_on), 'day'))) return true
        if (selectedYearRow && (value.isBefore(dayjs(selectedYearRow.starts_on), 'day') || value.isAfter(dayjs(selectedYearRow.ends_on), 'day'))) return true
        return false
      }}/></div>
    </section>
    {classId && <section className="attendance-sheet panel">
      <div className="attendance-sheet-heading"><div className="attendance-title"><span className="academic-card-icon"><CalendarOutlined/></span><div><h2>{classes.find(group => group.id === classId)?.name ?? 'Class attendance'}</h2><p>{attendanceDay.format('dddd, D MMMM YYYY')} · {roster.length} enrolled</p></div></div>
        <div className="attendance-actions"><Button icon={<CheckOutlined/>} onClick={bulkPresent} disabled={!roster.length}>Mark all present</Button><Button type="primary" icon={<SaveOutlined/>} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!roster.length || sheetQuery.isLoading}>{sheetQuery.data?.session_id ? 'Save changes' : 'Save attendance'}</Button></div>
      </div>
      <div className="attendance-summary"><Tag color="green">{totals.present} present</Tag><Tag color="red">{totals.absent} absent</Tag><Tag color="orange">{totals.late} late</Tag><Tag color="blue">{totals.excused} excused</Tag>{totals.unmarked > 0 && <Tag>{totals.unmarked} unmarked</Tag>}</div>
      {sheetQuery.isLoading ? <div className="attendance-loading"><Spin/><span>Loading class roster…</span></div> : roster.length ? <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>STUDENT</th><th>ADMISSION NUMBER</th><th>STATUS</th><th>NOTE</th></tr></thead><tbody>{roster.map(student => <tr key={student.student_id}><td><strong>{student.first_name} {student.last_name}</strong></td><td>{student.admission_number}</td><td><Select aria-label={`Attendance status for ${student.first_name} ${student.last_name}`} value={draft[student.student_id]?.status ?? 'unmarked'} options={statusOptions} onChange={value => setStudent(student.student_id, 'status', value)} className="attendance-status"/></td><td><Input aria-label={`Attendance note for ${student.first_name} ${student.last_name}`} value={draft[student.student_id]?.note ?? ''} onChange={event => setStudent(student.student_id, 'note', event.target.value)} placeholder="Optional note" maxLength={240}/></td></tr>)}</tbody></table></div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active students enrolled in this class"/>}
      <div className="attendance-footnote">Attendance corrections are audit logged with the staff member and time of change.</div>
    </section>}
    {!yearsQuery.isLoading && !years.length && !pageError && <section className="attendance-sheet panel"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Set up an academic year and enroll students before taking attendance"/></section>}
    {!!years.length && !classesQuery.isLoading && !classes.length && !pageError && <section className="attendance-sheet panel"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={user?.role === 'teacher' ? 'You are not assigned as the class teacher of a class in this academic year' : 'No classes are available for attendance in this academic year'}/></section>}
  </div>
}
