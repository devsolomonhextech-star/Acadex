import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Divider, Drawer, Empty, Input, InputNumber, Modal, Popconfirm, Progress, Select, Space,
  Spin, Table, Tag, Tooltip, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, EyeInvisibleOutlined, EyeOutlined, LockOutlined, PlusOutlined,
  PrinterOutlined, SaveOutlined, SettingOutlined, TeamOutlined, TrophyOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { fetchAcademicTerms, fetchAcademicYears, fetchClassGroups } from '../academic/academicApi'
import type { AcademicTerm, AcademicYear, ClassResults, GradingScale, StudentResult } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import {
  archiveGradingScale, computeClassResults, fetchClassResults, fetchGradingScales,
  fetchStudentBreakdown, publishClassResults, saveGradingScale, withdrawClassResults,
} from './resultsApi'

type BandDraft = { key: number; min_percent: number | null; max_percent: number | null; grade: string; points: number | null; description: string | null }

let bandKey = 0
function emptyBand(min: number, max: number): BandDraft {
  bandKey += 1
  return { key: bandKey, min_percent: min, max_percent: max, grade: '', points: null, description: null }
}

function bandsFromScale(scale: GradingScale): BandDraft[] {
  return scale.bands.map(band => {
    bandKey += 1
    return {
      key: bandKey,
      min_percent: Number(band.min_percent),
      max_percent: Number(band.max_percent),
      grade: band.grade,
      points: band.points === null ? null : Number(band.points),
      description: band.description,
    }
  })
}

function defaultBands(): BandDraft[] {
  return [emptyBand(0, 39.99), emptyBand(40, 49.99), emptyBand(50, 59.99), emptyBand(60, 69.99), emptyBand(70, 100)]
}

function validateBands(bands: BandDraft[]): string | null {
  if (!bands.length) return 'Add at least one grade band'
  const ordered = [...bands].sort((a, b) => (a.min_percent ?? 0) - (b.min_percent ?? 0))
  for (const band of ordered) {
    if (band.min_percent === null || band.max_percent === null) return 'Every band needs a minimum and maximum'
    if (band.min_percent > band.max_percent) return 'A band minimum cannot exceed its maximum'
    if (!band.grade.trim()) return 'Every band needs a grade label'
  }
  if (ordered[0].min_percent !== 0) return 'The lowest band must start at 0'
  if (ordered[ordered.length - 1].max_percent !== 100) return 'The highest band must end at 100'
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1].max_percent!
    const current = ordered[index].min_percent!
    if (Math.round((current - previous) * 100) !== 1) return 'Grade bands must be contiguous with no gaps or overlaps'
  }
  return null
}

export default function ResultsPage() {
  const { accessToken, user } = useAuth()
  const { yearId: periodYearId, termId: periodTermId, setYearId: setPeriodYearId, setTermId: setPeriodTermId } = useAcademicPeriod()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [selectedClass, setSelectedClass] = useState('')
  const [scalesOpen, setScalesOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingScaleId, setEditingScaleId] = useState<string | null>(null)
  const [scaleName, setScaleName] = useState('')
  const [scaleDefault, setScaleDefault] = useState(true)
  const [scalePositions, setScalePositions] = useState(true)
  const [bands, setBands] = useState<BandDraft[]>(defaultBands)
  const [bandError, setBandError] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState('')
  const [breakdownStudent, setBreakdownStudent] = useState<StudentResult | null>(null)

  const canManage = ['school_admin', 'principal'].includes(user?.role ?? '')
  const canCompute = ['school_admin', 'principal', 'registrar'].includes(user?.role ?? '')

  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some((year: AcademicYear) => year.id === periodYearId) ? periodYearId : years[0]?.id ?? ''
  const termsQuery = useQuery({ queryKey: ['academic-terms', user?.school_id, yearId], queryFn: () => fetchAcademicTerms(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const terms = (termsQuery.data ?? []) as AcademicTerm[]
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classes = classesQuery.data ?? []
  const termId = terms.some(term => term.id === periodTermId) ? periodTermId : terms[0]?.id ?? ''
  const classId = classes.some(group => group.id === selectedClass) ? selectedClass : classes[0]?.id ?? ''

  const scalesQuery = useQuery({ queryKey: ['grading-scales', user?.school_id], queryFn: () => fetchGradingScales(accessToken!), enabled: !!accessToken })
  const scales = scalesQuery.data ?? []
  const hasDefaultScale = scales.some(scale => scale.is_default)

  const resultsQuery = useQuery({
    queryKey: ['class-results', user?.school_id, classId, termId],
    queryFn: () => fetchClassResults(accessToken!, classId, termId),
    enabled: !!accessToken && !!classId && !!termId,
  })
  const results = resultsQuery.data as ClassResults | undefined
  const published = results?.publication.status === 'published'
  const breakdownQuery = useQuery({
    queryKey: ['student-result-breakdown', user?.school_id, classId, termId, breakdownStudent?.student_id],
    queryFn: () => fetchStudentBreakdown(accessToken!, classId, termId, breakdownStudent!.student_id),
    enabled: !!accessToken && !!classId && !!termId && !!breakdownStudent,
  })
  const breakdown = breakdownQuery.data

  const subjectColumns = useMemo<TableColumnsType<StudentResult>>(() => {
    const subjects = new Map<string, { name: string; code: string }>()
    for (const student of results?.students ?? []) {
      for (const subject of student.subjects) {
        if (!subjects.has(subject.subject_id)) {
          subjects.set(subject.subject_id, { name: subject.subject_name, code: subject.subject_code })
        }
      }
    }
    const dynamic: TableColumnsType<StudentResult> = [...subjects.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([subjectId, subject]) => ({
        title: <Tooltip title={subject.name}><span className="term-subject-head">{subject.code || subject.name}</span></Tooltip>,
        key: subjectId,
        align: 'right',
        render: (_, row) => {
          const entry = row.subjects.find(item => item.subject_id === subjectId)
          if (!entry) return <span className="results-missing">—</span>
          return (
            <span className="term-score">
              <strong>{Number(entry.weighted_total).toFixed(1)}</strong>
              <em>{entry.grade ?? '—'}</em>
            </span>
          )
        },
      }))
    return [
      {
        title: 'STUDENT',
        key: 'student',
        fixed: 'left',
        width: 232,
        render: (_, row) => (
          <button
            type="button"
            className="term-student"
            onClick={() => setBreakdownStudent(row)}
            aria-label={`View ${row.first_name} ${row.last_name}'s result breakdown`}
          >
            <span className="term-avatar">{`${row.first_name[0] ?? ''}${row.last_name[0] ?? ''}`.toUpperCase()}</span>
            <span className="term-student-copy">
              <strong>{row.first_name} {row.last_name}</strong>
              <small>{row.admission_number}</small>
            </span>
          </button>
        ),
      },
      ...dynamic,
      {
        title: 'AVERAGE',
        key: 'aggregate',
        align: 'right',
        width: 116,
        render: (_, row) => row.aggregate_percent === null
          ? <span className="results-missing">Incomplete</span>
          : (
            <span className="term-average">
              <strong>{Number(row.aggregate_percent).toFixed(1)}</strong>
              <em>{row.grade ?? '—'}</em>
            </span>
          ),
      },
      {
        title: 'RANK',
        key: 'position',
        align: 'center',
        width: 82,
        render: (_, row) => row.position === null
          ? <span className="results-missing">—</span>
          : <span className={`term-rank${row.position <= 3 ? ' is-top' : ''}`}>{row.position}</span>,
      },
      {
        title: '',
        key: 'actions',
        align: 'right',
        width: 92,
        render: (_, row) => (
          <span className="term-row-actions">
            <Tooltip title="Assessment breakdown">
              <Button
                type="text" size="small" icon={<EyeOutlined />}
                onClick={() => setBreakdownStudent(row)}
                aria-label={`Breakdown for ${row.first_name} ${row.last_name}`}
              />
            </Tooltip>
            {published && (
              <Tooltip title="Open report card">
                <Button
                  type="text" size="small" icon={<PrinterOutlined />}
                  onClick={() => navigate(`/report-card?student_id=${row.student_id}&term_id=${termId}`)}
                  aria-label={`Report card for ${row.first_name} ${row.last_name}`}
                />
              </Tooltip>
            )}
          </span>
        ),
      },
    ]
  }, [results, published, termId, navigate])

  const summary = useMemo(() => {
    const rows = results?.students ?? []
    const scored = rows.filter(row => row.aggregate_percent !== null)
    const average = scored.length
      ? scored.reduce((total, row) => total + Number(row.aggregate_percent), 0) / scored.length
      : null
    const best = scored.reduce<StudentResult | null>(
      (top, row) => (!top || Number(row.aggregate_percent) > Number(top.aggregate_percent) ? row : top),
      null,
    )
    return { total: rows.length, scored: scored.length, average, best }
  }, [results])

  const refreshAll = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['class-results', user?.school_id] }),
    queryClient.invalidateQueries({ queryKey: ['grading-scales', user?.school_id] }),
  ])

  const computeMutation = useMutation({
    mutationFn: () => computeClassResults(accessToken!, classId, termId),
    onSuccess: async data => {
      queryClient.setQueryData(['class-results', user?.school_id, classId, termId], data)
      toast.success('Term totals computed from approved assessments')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const publishMutation = useMutation({
    mutationFn: () => publishClassResults(accessToken!, classId, termId, publishConfirm),
    onSuccess: async data => {
      queryClient.setQueryData(['class-results', user?.school_id, classId, termId], data)
      setPublishOpen(false); setPublishConfirm('')
      toast.success('Results published and locked')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const withdrawMutation = useMutation({
    mutationFn: () => withdrawClassResults(accessToken!, classId, termId),
    onSuccess: async data => {
      queryClient.setQueryData(['class-results', user?.school_id, classId, termId], data)
      toast.success('Publication withdrawn. Results can be recomputed.')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const saveScaleMutation = useMutation({
    mutationFn: () => saveGradingScale(accessToken!, {
      name: scaleName.trim(),
      is_default: scaleDefault,
      include_positions: scalePositions,
      bands: bands.map(band => ({
        min_percent: Number(band.min_percent).toFixed(2),
        max_percent: Number(band.max_percent).toFixed(2),
        grade: band.grade.trim(),
        points: band.points === null ? null : band.points.toFixed(2),
        description: band.description?.trim() || null,
      })),
    }, editingScaleId ?? undefined),
    onSuccess: async () => {
      await refreshAll()
      closeScaleEditor()
      toast.success(editingScaleId ? 'Grading scale updated' : 'Grading scale created')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const archiveScaleMutation = useMutation({
    mutationFn: (scaleId: string) => archiveGradingScale(accessToken!, scaleId),
    onSuccess: async () => {
      await refreshAll()
      toast.success('Grading scale archived')
    },
    onError: error => toast.error(formatApiError(error)),
  })

  function openScaleEditor(scale?: GradingScale) {
    setBandError(null)
    if (scale) {
      setEditingScaleId(scale.id)
      setScaleName(scale.name)
      setScaleDefault(scale.is_default)
      setScalePositions(scale.include_positions)
      setBands(bandsFromScale(scale))
    } else {
      setEditingScaleId(null)
      setScaleName('')
      setScaleDefault(!scales.length)
      setScalePositions(true)
      setBands(defaultBands())
    }
    setEditorOpen(true)
  }

  function closeScaleEditor() {
    setEditorOpen(false)
    setEditingScaleId(null)
    setScaleName('')
    setBands(defaultBands())
    setBandError(null)
  }

  function submitScale() {
    const trimmed = scaleName.trim()
    if (trimmed.length < 2) { setBandError('Give the scale a name of at least two characters'); return }
    const problem = validateBands(bands)
    if (problem) { setBandError(problem); return }
    setBandError(null)
    saveScaleMutation.mutate()
  }

  function updateBand(key: number, patch: Partial<BandDraft>) {
    setBands(current => current.map(band => (band.key === key ? { ...band, ...patch } : band)))
  }

  const pageError = yearsQuery.error ?? termsQuery.error ?? classesQuery.error ?? resultsQuery.error ?? scalesQuery.error
  const selectedClassRow = classes.find(group => group.id === classId)
  const selectedTermRow = terms.find(term => term.id === termId)
  const classHasSubjects = (results?.students ?? []).some(student => student.subjects.length > 0)

  const status = results?.publication.status ?? 'draft'
  const statusLabel = published ? 'Published' : status === 'withdrawn' ? 'Withdrawn' : 'Draft'
  const publishedOn = results?.publication.published_at
    ? new Date(results.publication.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return <div className="page-content results-page">
    {contextHolder}
    <div className="eyebrow">ACADEMIC OPERATIONS</div>
    <div className="term-heading">
      <div>
        <h1>Term results</h1>
        <p>Weighted totals from approved assessments — review the class, then publish when every grade is right.</p>
      </div>
      <div className="term-heading-actions">
        {canManage && (
          <Button icon={<SettingOutlined />} onClick={() => setScalesOpen(true)} disabled={!scalesQuery.isSuccess}>
            Grading scales
          </Button>
        )}
      </div>
    </div>

    <div className="stats-grid term-stats">
      <div className="stat-card">
        <div className="stat-top"><span>Students</span><span className="stat-icon blue"><TeamOutlined /></span></div>
        <div className="stat-value">{summary.total}</div>
        <div className="stat-foot">{summary.scored} with complete totals</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Class average</span><span className="stat-icon green"><TrophyOutlined /></span></div>
        <div className="stat-value">{summary.average === null ? '—' : `${summary.average.toFixed(1)}%`}</div>
        <div className="stat-foot">{selectedTermRow?.name ?? 'This term'} · all subjects</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Top of class</span><span className="stat-icon purple"><TrophyOutlined /></span></div>
        <div className="stat-value">{summary.best ? `${Number(summary.best.aggregate_percent).toFixed(1)}%` : '—'}</div>
        <div className="stat-foot">{summary.best ? `${summary.best.first_name} ${summary.best.last_name}` : 'No results yet'}</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>Status</span><span className="stat-icon orange"><ClockCircleOutlined /></span></div>
        <div className={`stat-value term-status-value is-${published ? 'published' : status}`}>{statusLabel}</div>
        <div className="stat-foot">{publishedOn ? `Published ${publishedOn}` : 'Not published to families'}</div>
      </div>
    </div>

    {pageError && <Alert type="error" showIcon message="Could not load results data" description={formatApiError(pageError)} className="student-error"/>}
    {!hasDefaultScale && scalesQuery.isSuccess &&
      <Alert type="warning" showIcon className="student-error"
             message="No default grading scale yet"
             description={canManage
               ? 'Create a grading scale and mark it as default before computing or publishing results.'
               : 'Ask a school administrator to configure a default grading scale before results can be computed.'}/>}

    <section className="term-controls panel">
      <div className="term-filter">
        <span>Academic year</span>
        <Select value={yearId || undefined} placeholder="Choose year"
                onChange={value => { setPeriodYearId(value); setSelectedClass('') }}
                options={years.map((year: AcademicYear) => ({ value: year.id, label: year.name }))}/>
      </div>
      <div className="term-filter">
        <span>Term</span>
        <Select value={termId || undefined} placeholder="Choose term"
                onChange={setPeriodTermId}
                options={terms.map((term: AcademicTerm) => ({ value: term.id, label: term.name }))} disabled={!terms.length}/>
      </div>
      <div className="term-filter">
        <span>Class group</span>
        <Select value={classId || undefined} placeholder="Choose class"
                onChange={value => setSelectedClass(value)}
                options={classes.map(group => ({ value: group.id, label: group.name }))} disabled={!classes.length}/>
      </div>
      <div className="term-controls-side">
        <span className={`term-status-pill is-${published ? 'published' : status}`}>
          {published ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          {statusLabel}
        </span>
        {results?.grading_scale_name && <Tag className="term-scale-tag">{results.grading_scale_name}</Tag>}
      </div>
    </section>

    <section className={`term-publication is-${published ? 'published' : status}`}>
      <span className="term-publication-icon">
        {published ? <LockOutlined /> : <ClockCircleOutlined />}
      </span>
      <div className="term-publication-copy">
        <strong>
          {published
            ? 'Published and locked'
            : status === 'withdrawn' ? 'Publication withdrawn' : 'Draft — not visible to families'}
        </strong>
        <p>
          {published
            ? `Locked${publishedOn ? ` on ${publishedOn}` : ''}. Families can open report cards, and approved scores stay frozen until you withdraw the publication.`
            : status === 'withdrawn'
              ? 'Recompute the totals and publish again once the class is ready. Families cannot see results until then.'
              : 'Totals are computed but hidden from families. Review every grade, then publish to release report cards.'}
        </p>
      </div>
      <div className="term-publication-actions">
        {canCompute && !published && (
          <Button
            icon={<SaveOutlined />}
            loading={computeMutation.isPending}
            disabled={!classHasSubjects && !!results}
            onClick={() => computeMutation.mutate()}
          >
            {results?.students.length ? 'Recompute' : 'Compute results'}
          </Button>
        )}
        {canManage && !published && results && results.students.length > 0 && (
          <Button type="primary" icon={<LockOutlined />} onClick={() => { setPublishConfirm(''); setPublishOpen(true) }}>
            Publish results
          </Button>
        )}
        {canManage && published && (
          <Popconfirm
            title="Withdraw this publication?"
            description="Report cards stop being available and results can be recomputed."
            okText="Withdraw" okButtonProps={{ danger: true }}
            onConfirm={() => withdrawMutation.mutate()}
          >
            <Button danger icon={<EyeInvisibleOutlined />} loading={withdrawMutation.isPending}>
              Withdraw publication
            </Button>
          </Popconfirm>
        )}
      </div>
    </section>

    <section className="term-results panel">
      <header className="term-results-head">
        <div>
          <h2>{selectedClassRow?.name ?? 'Class results'}</h2>
          <p>
            {selectedTermRow?.name ?? 'Choose a term'}
            {results?.grading_scale_name ? ` · ${results.grading_scale_name}` : ''}
            {` · ${summary.total} student${summary.total === 1 ? '' : 's'}`}
          </p>
        </div>
        {published && <span className="term-lock"><CheckCircleOutlined /> Results locked</span>}
      </header>

      {results && results.students.length > 0 && !classHasSubjects && (
        <p className="term-note">
          Term totals are recorded for this class, but subject-level results are missing.
          The subject columns appear once totals are computed from approved assessments.
        </p>
      )}

      {resultsQuery.isLoading ? (
        <div className="results-loading"><Spin/><span>Loading results…</span></div>
      ) : results && results.students.length > 0 ? (
        <Table<StudentResult>
          rowKey="student_id"
          columns={subjectColumns}
          dataSource={results.students}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          tableLayout="fixed"
          scroll={{ x: 560 + Math.max(0, subjectColumns.length - 4) * 96 }}
          size="middle"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No results computed"/> }}
        />
      ) : (
        <div className="term-empty">
          <span className="term-empty-icon"><TrophyOutlined /></span>
          <h3>No results for this class yet</h3>
          <p>
            {canCompute
              ? `Compute ${selectedClassRow?.name ?? 'this class'} once approved assessments have complete scores.`
              : 'Results have not been computed for this class and term yet.'}
          </p>
          {canCompute && (
            <Button
              type="primary" icon={<SaveOutlined />}
              loading={computeMutation.isPending}
              disabled={!classHasSubjects && !!results}
              onClick={() => computeMutation.mutate()}
            >
              Compute results
            </Button>
          )}
        </div>
      )}
    </section>

    <Drawer className="result-breakdown-drawer" open={!!breakdownStudent} onClose={() => setBreakdownStudent(null)} width={760}
            title={<div className="result-drawer-title"><span>STUDENT RESULT BREAKDOWN</span><strong>{breakdownStudent ? `${breakdownStudent.first_name} ${breakdownStudent.last_name}` : ''}</strong></div>}>
      {breakdownQuery.isLoading ? <div className="results-loading"><Spin/><span>Loading assessment breakdown…</span></div>
        : breakdownQuery.isError ? <Alert type="error" showIcon message="Could not load this result breakdown" description={formatApiError(breakdownQuery.error)} action={<Button size="small" onClick={() => void breakdownQuery.refetch()}>Retry</Button>}/>
          : breakdown && <div className="result-breakdown-content">
            <div className="result-breakdown-context"><span>{breakdown.class_name}</span><i>·</i><span>{breakdown.term_name}</span><i>·</i><span>{breakdown.admission_number}</span></div>
            <div className="result-breakdown-summary">
              <div className="result-breakdown-average"><small>TERM AVERAGE</small><strong>{breakdown.aggregate_percent === null ? '—' : `${Number(breakdown.aggregate_percent).toFixed(1)}%`}</strong><span>{breakdown.grading_scale_name ?? 'No grading scale'}</span></div>
              <div className="result-breakdown-grade"><small>FINAL GRADE</small><strong>{breakdown.grade ?? 'Incomplete'}</strong><span>{breakdown.grade_band ? `${Number(breakdown.grade_band.min_percent)}–${Number(breakdown.grade_band.max_percent)}%${breakdown.grade_band.description ? ` · ${breakdown.grade_band.description}` : ''}` : 'Grade band not assigned'}</span></div>
              <div className="result-breakdown-position"><small>CLASS POSITION</small><strong>{breakdown.position ? `#${breakdown.position}` : '—'}</strong><span>out of {breakdown.class_size} students</span></div>
            </div>
            <Alert type="info" showIcon message="How the term result is calculated" description="Each approved assessment is converted to a percentage and weighted within its subject. Subject totals are then combined using each subject’s assessment weight. The final average is matched to the grading scale shown above." />
            <Divider>Subject performance</Divider>
            {breakdown.subjects.length ? <div className="result-subject-breakdowns">{breakdown.subjects.map(subject => <article className="result-subject-breakdown" key={subject.subject_id}>
              <header><div><h3>{subject.subject_name}</h3><small>{subject.assessments.length} approved assessment{subject.assessments.length === 1 ? '' : 's'} · {Number(subject.total_weight).toFixed(1)}% combined weight</small></div><div className="result-subject-grade"><strong>{subject.weighted_total === null ? 'Incomplete' : `${Number(subject.weighted_total).toFixed(1)}%`}</strong><Tag color={subject.grade ? 'blue' : 'default'}>{subject.grade ?? '—'}</Tag></div></header>
              {subject.weighted_total !== null && <Progress percent={Math.max(0, Math.min(100, Number(subject.weighted_total)))} showInfo={false} strokeColor="#4d6de5"/>}
              <div className="result-assessment-table-wrap"><table className="result-assessment-table"><thead><tr><th>ASSESSMENT</th><th>SCORE</th><th>WEIGHT</th><th>SUBJECT CONTRIBUTION</th></tr></thead><tbody>{subject.assessments.map(assessment => <tr key={assessment.id}><td><b>{assessment.title}</b><small>{assessment.category.replaceAll('_', ' ')}</small></td><td>{assessment.score === null ? <Tag>Not scored</Tag> : <><b>{Number(assessment.score).toFixed(1)} / {Number(assessment.max_score).toFixed(1)}</b><small>{Number(assessment.score_percent).toFixed(1)}%</small></>}</td><td>{Number(assessment.weight_percent).toFixed(1)}%</td><td>{assessment.contribution_percent === null ? '—' : `${Number(assessment.contribution_percent).toFixed(2)} pts`}</td></tr>)}</tbody></table></div>
              {subject.weight_share_percent !== null && <footer>Counts for <b>{Number(subject.weight_share_percent).toFixed(1)}%</b> of the term average{subject.term_contribution_percent !== null ? ` · contributes ${Number(subject.term_contribution_percent).toFixed(2)} points` : ''}</footer>}
            </article>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No approved assessments were found for this student"/>}
          </div>}
    </Drawer>

    <Modal title="Grading scales" open={scalesOpen} onCancel={() => setScalesOpen(false)} footer={null} width={760} destroyOnClose>
      <div className="scale-form">
        <p className="scale-help">A scale converts weighted term totals into grade labels and points. Set one scale as default — new computations and publications use it.</p>
        {scalesQuery.isLoading && <div className="results-loading"><Spin/><span>Loading scales…</span></div>}
        {scalesQuery.data && !scales.length &&
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No grading scales yet. Create one to compute results."/>}
        <div className="scale-list">
          {scales.map(scale => <div className="scale-list-row" key={scale.id}>
            <div className="scale-list-main">
              <strong>{scale.name}</strong>
              <Space size={4}>
                {scale.is_default && <Tag color="green">Default</Tag>}
                {!scale.include_positions && <Tag>Positions off</Tag>}
                <Tag color="blue">{scale.bands.length} bands</Tag>
              </Space>
              <small>{[...scale.bands].sort((a, b) => Number(b.min_percent) - Number(a.min_percent))
                .map(band => `${band.grade} ${Number(band.min_percent)}–${Number(band.max_percent)}`).join(' · ')}</small>
            </div>
            <Space>
              <Button size="small" onClick={() => openScaleEditor(scale)}>Edit</Button>
              <Button size="small" danger disabled={scale.is_default}
                      loading={archiveScaleMutation.isPending && archiveScaleMutation.variables === scale.id}
                      onClick={() => archiveScaleMutation.mutate(scale.id)}>Archive</Button>
            </Space>
          </div>)}
        </div>
        <div className="student-form-actions">
          <Button onClick={() => setScalesOpen(false)}>Close</Button>
          <Button type="primary" icon={<PlusOutlined/>} onClick={() => openScaleEditor()}>New scale</Button>
        </div>
      </div>
    </Modal>

    <Modal title={editingScaleId ? 'Edit grading scale' : 'New grading scale'} open={editorOpen}
           onCancel={closeScaleEditor} footer={null} width={760} destroyOnClose>
      <div className="scale-form">
        <div className="scale-form-row">
          <label className="scale-field">
            <span>Scale name</span>
            <Input value={scaleName} onChange={event => setScaleName(event.target.value)} maxLength={80} placeholder="Primary scale"/>
          </label>
          <label className="scale-toggle">
            <input type="checkbox" checked={scaleDefault} onChange={event => setScaleDefault(event.target.checked)}/>
            <span>Default scale used for new results</span>
          </label>
          <label className="scale-toggle">
            <input type="checkbox" checked={scalePositions} onChange={event => setScalePositions(event.target.checked)}/>
            <span>Include class positions</span>
          </label>
        </div>
        <div className="scale-bands-head">
          <span>GRADE BANDS</span>
          <Button size="small" icon={<PlusOutlined/>}
                  onClick={() => setBands(current => [...current, emptyBand(0, 0)])}>Add band</Button>
        </div>
        <div className="scale-band-list">
          {bands.map(band => <div className="scale-band" key={band.key}>
            <InputNumber aria-label="Band minimum" min={0} max={100} precision={2} value={band.min_percent}
                         onChange={value => updateBand(band.key, { min_percent: value === null ? null : Number(value) })} addonAfter="%"/>
            <InputNumber aria-label="Band maximum" min={0} max={100} precision={2} value={band.max_percent}
                         onChange={value => updateBand(band.key, { max_percent: value === null ? null : Number(value) })} addonAfter="%"/>
            <Input aria-label="Grade label" value={band.grade} maxLength={12} placeholder="A"
                   onChange={event => updateBand(band.key, { grade: event.target.value })}/>
            <InputNumber aria-label="Grade points" min={0} max={100} precision={2} value={band.points} placeholder="Points"
                         onChange={value => updateBand(band.key, { points: value === null ? null : Number(value) })}/>
            <Input aria-label="Band description" value={band.description ?? ''} maxLength={80} placeholder="Description"
                   onChange={event => updateBand(band.key, { description: event.target.value || null })}/>
            <Button size="small" danger type="text" onClick={() => setBands(current => current.filter(item => item.key !== band.key))}
                    disabled={bands.length <= 1}>Remove</Button>
          </div>)}
        </div>
        {bandError && <Alert type="error" showIcon message={bandError} className="scale-band-error"/>}
        <p className="scale-help">Bands must cover 0–100 with no gaps. Weighted term totals are matched to the band containing the final score.</p>
        <div className="student-form-actions">
          <Button onClick={closeScaleEditor}>Cancel</Button>
          <Button type="primary" loading={saveScaleMutation.isPending} onClick={submitScale}>
            {editingScaleId ? 'Save scale' : 'Create scale'}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal title={`Publish results for ${selectedClassRow?.name ?? 'class'}`} open={publishOpen}
           onCancel={() => { setPublishOpen(false); setPublishConfirm('') }} footer={null} destroyOnClose>
      <p className="results-publish-copy">
        Publishing locks the current weighted totals, grades, and positions for {selectedTermRow?.name ?? 'this term'}.
        Teachers will no longer be able to change approved scores for this class, and results cannot be recomputed
        until a principal or administrator withdraws the publication.
      </p>
      <label className="scale-field">
        <span>Type <strong>{selectedClassRow?.name}</strong> to confirm</span>
        <Input value={publishConfirm} onChange={event => setPublishConfirm(event.target.value)}
               placeholder={selectedClassRow?.name ?? ''} onPressEnter={() => {
                 if (publishConfirm === selectedClassRow?.name) publishMutation.mutate()
               }}/>
      </label>
      <div className="student-form-actions">
        <Button onClick={() => { setPublishOpen(false); setPublishConfirm('') }}>Cancel</Button>
        <Button type="primary" danger disabled={publishConfirm !== (selectedClassRow?.name ?? '')}
                loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>Publish and lock</Button>
      </div>
    </Modal>
  </div>
}
