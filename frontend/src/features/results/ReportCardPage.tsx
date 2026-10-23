import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Spin } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import type { ReportCard } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { fetchReportCard } from './resultsApi'

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div className="rc-info-cell"><span>{label}</span><strong>{value}</strong></div>
}

export default function ReportCardPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const studentId = search.get('student_id') ?? ''
  const termId = search.get('term_id') ?? ''

  const cardQuery = useQuery({
    queryKey: ['report-card', studentId, termId],
    queryFn: () => fetchReportCard(accessToken!, studentId, termId),
    enabled: !!accessToken && !!studentId && !!termId,
    retry: false,
  })
  const card = cardQuery.data as ReportCard | undefined

  if (!studentId || !termId) {
    return <div className="page-content report-card-page">
      <Alert type="warning" showIcon message="Missing report card context"
             description="Open a report card from the Term results screen."/>
      <div className="rc-back"><Link to="/results"><Button icon={<ArrowLeftOutlined/>}>Back to results</Button></Link></div>
    </div>
  }

  return <div className="page-content report-card-page">
    <div className="rc-actions">
      <Button icon={<ArrowLeftOutlined/>} onClick={() => navigate('/results')}>Back to results</Button>
      <Button type="primary" icon={<PrinterOutlined/>} disabled={!card} onClick={() => window.print()}>
        Print report card
      </Button>
    </div>

    {cardQuery.isLoading && <div className="results-loading"><Spin/><span>Loading report card…</span></div>}
    {cardQuery.error && <Alert type="error" showIcon className="student-error" message="Could not load this report card"
                                description={formatApiError(cardQuery.error)}/>}

    {card && <article className="rc-sheet">
      <header className="rc-header">
        <div className="rc-school">{card.school_name}</div>
        <div className="rc-title">
          <strong>Term Report Card</strong>
          <span>{card.academic_year_name} · {card.term_name}</span>
        </div>
        <div className="rc-term-dates">{dayjs(card.term_starts_on).format('D MMM YYYY')} – {dayjs(card.term_ends_on).format('D MMM YYYY')}</div>
      </header>

      <section className="rc-info">
        <InfoCell label="STUDENT" value={`${card.first_name} ${card.last_name}`}/>
        <InfoCell label="ADMISSION NO." value={card.admission_number}/>
        <InfoCell label="CLASS" value={`${card.class_name}${card.class_stream ? ` · ${card.class_stream}` : ''}`}/>
        <InfoCell label="ACADEMIC YEAR" value={card.academic_year_name}/>
      </section>

      <table className="rc-table">
        <thead>
          <tr><th>SUBJECT</th><th>CODE</th><th className="rc-num">SCORE</th><th className="rc-num">GRADE</th><th className="rc-num">POINTS</th></tr>
        </thead>
        <tbody>
          {card.subjects.map(subject => <tr key={subject.subject_id}>
            <td>{subject.subject_name}</td>
            <td>{subject.subject_code}</td>
            <td className="rc-num">{Number(subject.weighted_total).toFixed(1)}%</td>
            <td className="rc-num">{subject.grade ?? '—'}</td>
            <td className="rc-num">{subject.points === null ? '—' : Number(subject.points).toFixed(1)}</td>
          </tr>)}
          {!card.subjects.length && <tr><td className="rc-empty" colSpan={5}>No subject results recorded</td></tr>}
        </tbody>
      </table>

      <section className="rc-summary">
        <div className="rc-summary-cell">
          <span>TERM AVERAGE</span>
          <strong>{Number(card.aggregate_percent).toFixed(1)}%</strong>
        </div>
        <div className="rc-summary-cell">
          <span>OVERALL GRADE</span>
          <strong>{card.aggregate_grade ?? '—'}</strong>
        </div>
        <div className="rc-summary-cell">
          <span>POINTS</span>
          <strong>{card.aggregate_points === null ? '—' : Number(card.aggregate_points).toFixed(1)}</strong>
        </div>
        <div className="rc-summary-cell">
          <span>CLASS POSITION</span>
          <strong>{card.position === null ? '—' : `${card.position} of ${card.class_size}`}</strong>
        </div>
      </section>

      <footer className="rc-footer">
        <div>
          <span>GRADING SCALE</span>
          <strong>{card.grading_scale_name ?? '—'}</strong>
        </div>
        <div>
          <span>PUBLISHED</span>
          <strong>{card.published_at ? dayjs(card.published_at).format('D MMM YYYY, HH:mm') : '—'}
            {card.published_by ? ` by ${card.published_by}` : ''}</strong>
        </div>
        <div className="rc-generated">Generated {dayjs().format('D MMM YYYY')} · SchoolOS</div>
      </footer>
    </article>}
  </div>
}
