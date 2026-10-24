import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Empty, Modal, Popconfirm, Select, Spin, Table, Tabs, Tag, Upload } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, CloudUploadOutlined, DownloadOutlined, FileExcelOutlined, FileTextOutlined, HistoryOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  confirmImport, downloadImportErrors, downloadImportTemplate, fetchImportHistory, uploadImportPreview,
} from './studentsApi'
import type { ImportJobDetail, ImportJobSummary, ImportRow } from '../../shared/api/types'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'

const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx']

const rowStatus: Record<ImportRow['status'], { color: string; label: string }> = {
  valid: { color: 'green', label: 'ready' },
  created: { color: 'green', label: 'created' },
  duplicate: { color: 'orange', label: 'duplicate' },
  error: { color: 'red', label: 'error' },
}

type Step = 'idle' | 'preview' | 'done'

export default function ImportStudentsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('idle')
  const [job, setJob] = useState<ImportJobDetail | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [historyPage, setHistoryPage] = useState(1)

  useEffect(() => {
    if (!open) {
      setStep('idle')
      setJob(null)
      setUploadError('')
      setHistoryPage(1)
    }
  }, [open])

  const history = useQuery({
    queryKey: ['student-imports', user?.school_id, historyPage],
    queryFn: () => fetchImportHistory(accessToken!, historyPage),
    enabled: Boolean(open && accessToken && user),
  })

  const preview = useMutation({
    mutationFn: (file: File) => uploadImportPreview(accessToken!, file),
    onSuccess: detail => {
      setJob(detail)
      setStep('preview')
      setUploadError('')
      void queryClient.invalidateQueries({ queryKey: ['student-imports'] })
    },
    onError: error => setUploadError(formatApiError(error)),
  })

  const confirm = useMutation({
    mutationFn: () => confirmImport(accessToken!, job!.id),
    onSuccess: async detail => {
      setJob(detail)
      setStep('done')
      await queryClient.invalidateQueries({ queryKey: ['students', user?.school_id] })
      await queryClient.invalidateQueries({ queryKey: ['student-imports'] })
    },
    onError: error => setUploadError(formatApiError(error)),
  })

  const handleFile = (file: File) => {
    setUploadError('')
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setUploadError('Choose a .csv or .xlsx file.')
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setUploadError('The file is larger than the 2 MB import limit.')
      return
    }
    preview.mutate(file)
    return false
  }

  const problems = job ? job.duplicate_rows + job.error_rows : 0
  const canDownloadErrors = Boolean(job && problems > 0)

  const newImportTab = (
    <div className="import-flow">
      <p className="modal-intro">
        Upload a CSV or Excel file with one row per student. Nothing is created until you review the
        preview and confirm — duplicate admission numbers and invalid rows are flagged first.
      </p>
      <div className="import-templates">
        <span>Start from a template:</span>
        <Button size="small" icon={<FileTextOutlined/>} loading={preview.isPending}
          onClick={() => void downloadImportTemplate(accessToken!, 'csv')}>CSV template</Button>
        <Button size="small" icon={<FileExcelOutlined/>} loading={preview.isPending}
          onClick={() => void downloadImportTemplate(accessToken!, 'xlsx')}>Excel template</Button>
      </div>
      {uploadError && <Alert className="import-alert" type="error" showIcon message={uploadError}/>}
      {step === 'idle' && (
        <div className="import-drop">
          {preview.isPending
            ? <Spin size="small" tip="Validating file…"/>
            : <>
                <CloudUploadOutlined className="import-drop-icon"/>
                <Upload accept=".csv,.xlsx" showUploadList={false} maxCount={1} beforeUpload={handleFile}>
                  <Button type="primary" ghost>Choose a file to preview</Button>
                </Upload>
                <span>Up to 2,000 rows, max 2 MB</span>
              </>}
        </div>
      )}
      {step === 'preview' && job && (
        <>
          <div className="import-counts">
            <div className="import-count ready"><strong>{job.valid_rows}</strong><span>Ready</span></div>
            <div className="import-count dup"><strong>{job.duplicate_rows}</strong><span>Duplicates</span></div>
            <div className="import-count err"><strong>{job.error_rows}</strong><span>Errors</span></div>
            <div className="import-count"><strong>{job.total_rows}</strong><span>Total rows</span></div>
            <div className="import-file">{job.filename}</div>
          </div>
          {problems > 0 && (
            <Alert className="import-alert" type="warning" showIcon
              message={`${problems} row${problems === 1 ? '' : 's'} will be skipped. Fix them in the file and re-upload, or download the error file after import.`}/>
          )}
          <PreviewTable job={job}/>
          <div className="student-form-actions import-actions">
            <Upload accept=".csv,.xlsx" showUploadList={false} beforeUpload={handleFile}>
              <Button>Choose another file</Button>
            </Upload>
            {canDownloadErrors && (
              <Button icon={<DownloadOutlined/>} onClick={() => void downloadImportErrors(accessToken!, job)}>
                Download problem rows
              </Button>
            )}
            <Popconfirm
              title={`Create ${job.valid_rows} student record${job.valid_rows === 1 ? '' : 's'}?`}
              description="Only ready rows are created; you can import the rest afterwards."
              okText="Create students" cancelText="Cancel"
              onConfirm={() => confirm.mutate()}
              disabled={job.valid_rows === 0}
            >
              <Button type="primary" icon={<CheckCircleOutlined/>} loading={confirm.isPending}
                disabled={job.valid_rows === 0}>
                Create {job.valid_rows} student{job.valid_rows === 1 ? '' : 's'}
              </Button>
            </Popconfirm>
          </div>
        </>
      )}
      {step === 'done' && job && (
        <div className="import-done">
          <div className="import-done-icon"><CheckCircleOutlined/></div>
          <h3>{job.created_rows} student{job.created_rows === 1 ? '' : 's'} created</h3>
          <p>
            {job.skipped_rows > 0
              ? `${job.skipped_rows} row${job.skipped_rows === 1 ? '' : 's'} skipped because the admission number already exists.`
              : 'Every ready row from the preview was imported.'}
            {problems > 0 ? ` ${problems} row${problems === 1 ? '' : 's'} still need attention.` : ''}
          </p>
          <div className="student-form-actions import-actions">
            {canDownloadErrors && (
              <Button icon={<DownloadOutlined/>} onClick={() => void downloadImportErrors(accessToken!, job)}>
                Download problem rows
              </Button>
            )}
            <Button onClick={() => { setStep('idle'); setJob(null); setUploadError('') }}>Import another file</Button>
            <Button type="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </div>
  )

  const historyColumns: TableColumnsType<ImportJobSummary> = [
    { title: 'FILE', dataIndex: 'filename', key: 'filename', render: (value: string) => <span className="import-history-file">{value}</span> },
    { title: 'UPLOADED', dataIndex: 'created_at', key: 'created_at', render: (value: string) => dayjs(value).format('D MMM YYYY, HH:mm') },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status',
      render: (value: ImportJobSummary['status']) => (
        <Tag color={value === 'confirmed' ? 'green' : 'blue'} bordered={false} className="student-status">{value}</Tag>
      ),
    },
    { title: 'CREATED', dataIndex: 'created_rows', key: 'created_rows', render: (value: number) => value || '—' },
    { title: 'SKIPPED', dataIndex: 'skipped_rows', key: 'skipped_rows', render: (value: number) => value || '—' },
    {
      title: '', key: 'errors', width: 60,
      render: (_, job) => (job.duplicate_rows + job.error_rows) > 0 ? (
        <Button type="text" size="small" icon={<DownloadOutlined/>} aria-label="Download problem rows"
          onClick={() => void downloadImportErrors(accessToken!, job)}/>
      ) : null,
    },
  ]

  const historyTab = (
    <Table<ImportJobSummary>
      rowKey="id"
      columns={historyColumns}
      dataSource={history.data?.items ?? []}
      loading={history.isLoading}
      pagination={{
        current: historyPage,
        pageSize: 10,
        total: history.data?.total ?? 0,
        onChange: setHistoryPage,
        showSizeChanger: false,
      }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No imports yet"/> }}
    />
  )

  return (
    <Modal title="Bulk student import" open={open} onCancel={onClose} footer={null} width={780} destroyOnHidden>
      <Tabs
        items={[
          { key: 'new', label: <span><CloudUploadOutlined/> New import</span>, children: newImportTab },
          { key: 'history', label: <span><HistoryOutlined/> History</span>, children: historyTab },
        ]}
      />
    </Modal>
  )
}

function PreviewTable({ job }: { job: ImportJobDetail }) {
  const [filter, setFilter] = useState<'all' | 'problems' | 'ready'>('all')
  const [page, setPage] = useState(1)
  const problems = job.duplicate_rows + job.error_rows
  const rows = job.rows.filter(row =>
    filter === 'all'
      || (filter === 'problems' && (row.status === 'error' || row.status === 'duplicate'))
      || (filter === 'ready' && row.status === 'valid'),
  )
  const columns: TableColumnsType<ImportRow> = [
    { title: '#', dataIndex: 'row_number', key: 'row_number', width: 46 },
    {
      title: 'STUDENT', key: 'name', width: 170,
      render: (_, row) => (
        <span className="import-student-cell">
          <strong>{row.first_name} {row.last_name}</strong>
          <small>{row.admission_number || '—'}</small>
        </span>
      ),
    },
    { title: 'DOB', dataIndex: 'date_of_birth', key: 'date_of_birth', width: 96,
      render: value => value ? dayjs(value).format('D MMM YYYY') : <span className="table-muted">—</span> },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status', width: 90,
      render: (value: ImportRow['status']) => (
        <Tag color={rowStatus[value].color} bordered={false} className="student-status">{rowStatus[value].label}</Tag>
      ),
    },
    {
      title: 'NOTES', dataIndex: 'message', key: 'message',
      render: value => value ?? <span className="table-muted">—</span>,
    },
  ]
  return (
    <div className="import-preview">
      <div className="import-preview-toolbar">
        <span>Preview of {job.filename}</span>
        <Select aria-label="Filter rows" value={filter} className="student-filter"
          options={[
            { value: 'all', label: `All rows (${job.total_rows})` },
            { value: 'problems', label: `Problems only (${problems})` },
            { value: 'ready', label: `Ready only (${job.valid_rows})` },
          ]}
          onChange={value => { setFilter(value); setPage(1) }}/>
      </div>
      <Table<ImportRow> rowKey="row_number" size="small" columns={columns} dataSource={rows}
        pagination={{ current: page, pageSize: 10, total: rows.length, onChange: setPage, showSizeChanger: false }}/>
    </div>
  )
}
