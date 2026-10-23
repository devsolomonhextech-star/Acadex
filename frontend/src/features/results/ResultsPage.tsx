import { useMemo, useState } from 'react'
import {
  Alert, Button, Empty, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, EyeInvisibleOutlined, LockOutlined, PlusOutlined, SaveOutlined, TrophyOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { fetchAcademicTerms, fetchAcademicYears, fetchClassGroups } from '../academic/academicApi'
import type { AcademicTerm, AcademicYear, ClassResults, GradingScale, StudentResult } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import {
  archiveGradingScale, computeClassResults, fetchClassResults, fetchGradingScales,
  publishClassResults, saveGradingScale, withdrawClassResults,
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
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
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

  const canManage = ['school_admin', 'principal'].includes(user?.role ?? '')
  const canCompute = ['school_admin', 'principal', 'registrar'].includes(user?.role ?? '')

  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some((year: AcademicYear) => year.id === selectedYear) ? selectedYear : years[0]?.id ?? ''
  const termsQuery = useQuery({ queryKey: ['academic-terms', user?.school_id, yearId], queryFn: () => fetchAcademicTerms(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const terms = (termsQuery.data ?? []) as AcademicTerm[]
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classes = classesQuery.data ?? []
  const termId = terms.some(term => term.id === selectedTerm) ? selectedTerm : terms[0]?.id ?? ''
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

  const subjectColumns = useMemo<TableColumnsType<StudentResult>>(() => {
    const subjects = new Map<string, { name: string; code: string }>()
    for (const student of results?.students ?? []) {
      for (const subject of student.subjects) {
        if (!subjects.has(subject.subject_id)) subjects.set(subject.subject_id, { name: subject.subject_name, code: subject.subject_code })
      }
    }
    const dynamic: TableColumnsType<StudentResult> = [...subjects.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(subject => ({
        title: subject.name,
        key: subject.code,
        align: 'right',
        render: (_, row) => {
          const entry = row.subjects.find(item => item.subject_name === subject.name)
          if (!entry) return <span className="results-missing">—</span>
          return <span className="results-cell"><strong>{Number(entry.weighted_total).toFixed(1)}</strong><small>{entry.grade ?? '—'}</small></span>
        },
      }))
    return [
      {
        title: 'STUDENT',
        key: 'student',
        fixed: 'left',
        width: 200,
        render: (_, row) => <div className="results-student"><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></div>,
      },
      ...dynamic,
      {
        title: 'TERM AVERAGE',
        key: 'aggregate',
        align: 'right',
        render: (_, row) => row.aggregate_percent === null
          ? <span className="results-missing">Incomplete</span>
          : <span className="results-cell"><strong>{Number(row.aggregate_percent).toFixed(1)}</strong><small>{row.grade ?? '—'}</small></span>,
      },
      {
        title: 'POSITION',
        key: 'position',
        align: 'center',
        render: (_, row) => row.position === null
          ? <span className="results-missing">—</span>
          : <Tag className="results-position" color={row.position === 1 ? 'gold' : 'blue'}>#{row.position}</Tag>,
      },
    ]
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

  return <div className="page-content results-page">
    {contextHolder}
    <div className="eyebrow">ACADEMIC OPERATIONS</div>
    <div className="students-heading">
      <div>
        <h1>Term results</h1>
        <p>Compute weighted term totals from approved assessments, review grades, and publish class results.</p>
      </div>
      <Space>
        {canManage && <Button onClick={() => setScalesOpen(true)} disabled={!scalesQuery.isSuccess}>Grading scales</Button>}
        {canCompute && results && !published &&
          <Button icon={<SaveOutlined/>} loading={computeMutation.isPending} disabled={!classHasSubjects && !!results}
                  onClick={() => computeMutation.mutate()}>Recompute</Button>}
        {canManage && results && !published && results.students.length > 0 &&
          <Button type="primary" icon={<LockOutlined/>} onClick={() => { setPublishConfirm(''); setPublishOpen(true) }}>Publish results</Button>}
        {canManage && published &&
          <Button danger icon={<EyeInvisibleOutlined/>} loading={withdrawMutation.isPending}
                  onClick={() => withdrawMutation.mutate()}>Withdraw publication</Button>}
      </Space>
    </div>

    {pageError && <Alert type="error" showIcon message="Could not load results data" description={formatApiError(pageError)} className="student-error"/>}
    {!hasDefaultScale && scalesQuery.isSuccess &&
      <Alert type="warning" showIcon className="student-error"
             message="No default grading scale yet"
             description={canManage
               ? 'Create a grading scale and mark it as default before computing or publishing results.'
               : 'Ask a school administrator to configure a default grading scale before results can be computed.'}/>}
    {resultsQuery.isSuccess && !resultsQuery.isFetching && !results?.students.length &&
      <Alert type="info" showIcon className="student-error" message="No computed results yet"
             description={canCompute
               ? `Compute results for ${selectedClassRow?.name ?? 'this class'} once approved assessments have complete scores.`
               : 'Results have not been computed for this class and term yet.'}/>}

    <section className="results-context panel">
      <div className="results-filter">
        <span>Academic year</span>
        <Select value={yearId || undefined} placeholder="Choose year"
                onChange={value => { setSelectedYear(value); setSelectedTerm(''); setSelectedClass('') }}
                options={years.map((year: AcademicYear) => ({ value: year.id, label: year.name }))}/>
      </div>
      <div className="results-filter">
        <span>Term</span>
        <Select value={termId || undefined} placeholder="Choose term"
                onChange={value => setSelectedTerm(value)}
                options={terms.map((term: AcademicTerm) => ({ value: term.id, label: term.name }))} disabled={!terms.length}/>
      </div>
      <div className="results-filter">
        <span>Class group</span>
        <Select value={classId || undefined} placeholder="Choose class"
                onChange={value => setSelectedClass(value)}
                options={classes.map(group => ({ value: group.id, label: group.name }))} disabled={!classes.length}/>
      </div>
      <div className="results-filter">
        <span>Status</span>
        <div className="results-status">
          {results
            ? <Tag color={published ? 'green' : results.publication.status === 'withdrawn' ? 'orange' : 'blue'}>
                {published ? 'Published' : results.publication.status === 'withdrawn' ? 'Withdrawn' : 'Draft'}
              </Tag>
            : <Tag>—</Tag>}
          {results?.grading_scale_name && <Tag color="purple">{results.grading_scale_name}</Tag>}
        </div>
      </div>
    </section>

    <section className="results-list panel">
      <div className="results-list-heading">
        <div className="results-title">
          <span className="academic-card-icon"><TrophyOutlined/></span>
          <div>
            <h2>Class results</h2>
            <p>{selectedClassRow?.name ?? 'Select a class'} · {selectedTermRow?.name ?? ''} · {results?.students.length ?? 0} students</p>
          </div>
        </div>
        {published && <Tag color="green" icon={<CheckCircleOutlined/>}>Published results are locked</Tag>}
      </div>
      {resultsQuery.isLoading
        ? <div className="results-loading"><Spin/><span>Loading results…</span></div>
        : results && results.students.length > 0
          ? <Table<StudentResult> rowKey="student_id" columns={subjectColumns} dataSource={results.students}
                                  pagination={{ pageSize: 10, showSizeChanger: false }}
                                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No results computed"/> }}/>
          : null}
    </section>

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
