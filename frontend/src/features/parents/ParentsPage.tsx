import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Empty, List, Modal, Select, Spin, Table, Tag, Tabs, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useAuth } from '../auth/authHooks'
import { fetchAnnouncements, fetchChildReportCard, fetchChildReportCards, fetchMyChildren, fetchNotifications } from './parentsApi'
import type { ParentReportCardTerm, ReportCard, ReportCardSubject } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { downloadReportCardPdf } from '../results/reportCardPdf'

const { Title, Paragraph, Text } = Typography

export default function ParentsPage() {
  const { accessToken } = useAuth()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [selectedReport, setSelectedReport] = useState<ParentReportCardTerm | null>(null)
  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'], queryFn: () => fetchMyChildren(accessToken!), enabled: !!accessToken,
  })
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'], queryFn: () => fetchAnnouncements(accessToken!), enabled: !!accessToken,
  })
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'], queryFn: () => fetchNotifications(accessToken!), enabled: !!accessToken,
  })
  const childId = children.some(child => child.id === selectedChildId) ? selectedChildId : children[0]?.id ?? ''
  const reportTermsQuery = useQuery({ queryKey: ['parent-report-cards', childId], queryFn: () => fetchChildReportCards(accessToken!, childId), enabled: !!accessToken && !!childId })
  const reportCardQuery = useQuery({ queryKey: ['parent-report-card', childId, selectedReport?.term_id], queryFn: () => fetchChildReportCard(accessToken!, childId, selectedReport!.term_id), enabled: !!accessToken && !!childId && !!selectedReport })
  const reportColumns: TableColumnsType<ReportCardSubject> = [
    { title: 'SUBJECT', dataIndex: 'subject_name', key: 'subject' },
    { title: 'SCORE', dataIndex: 'weighted_total', key: 'score', align: 'right', render: value => `${Number(value).toFixed(1)}%` },
    { title: 'GRADE', dataIndex: 'grade', key: 'grade', align: 'center', render: value => value ?? '—' },
    { title: 'POINTS', dataIndex: 'points', key: 'points', align: 'right', render: value => value == null ? '—' : Number(value).toFixed(1) },
  ]

  const items = [
    {
      key: 'children',
      label: 'My Children',
      children: children.length === 0 ? <Empty description="No linked students found" /> : (
        <List
          dataSource={children}
          renderItem={(child) => (
            <List.Item>
              <List.Item.Meta
                title={`${child.first_name} ${child.last_name}`}
                description={`Admission: ${child.admission_number} • Status: ${child.status}`}
              />
              <Tag color="blue">View Profile</Tag>
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'announcements',
      label: 'Announcements',
      children: announcements.length === 0 ? <Empty description="No announcements" /> : (
        <List
          dataSource={announcements}
          renderItem={(ann) => (
            <List.Item>
              <List.Item.Meta
                title={ann.title}
                description={<Paragraph>{ann.body}</Paragraph>}
              />
              <Text type="secondary">{new Date(ann.published_at).toLocaleDateString()}</Text>
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'reports',
      label: 'Academic reports',
      children: children.length === 0 ? <Empty description="Link a student profile to your parent account to view reports."/> : <div className="parent-reports">
        <div className="parent-report-filter"><div><strong>Published report cards</strong><span>Only official results released by the school appear here.</span></div><Select aria-label="Select child" value={childId} onChange={value => { setSelectedChildId(value); setSelectedReport(null) }} options={children.map(child => ({ value: child.id, label: `${child.first_name} ${child.last_name} · ${child.admission_number}` }))}/></div>
        {reportTermsQuery.error && <Alert type="error" showIcon message="Could not load published reports" description={formatApiError(reportTermsQuery.error)}/>}
        <List loading={reportTermsQuery.isLoading} dataSource={reportTermsQuery.data ?? []} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No published report cards are available for this student yet."/> }} renderItem={report => <List.Item actions={[<Button key="view" type="primary" ghost onClick={() => setSelectedReport(report)}>View report</Button>]}>
          <List.Item.Meta title={`${report.academic_year_name} · ${report.term_name}`} description={`Published ${new Date(report.published_at).toLocaleDateString('en-GB')}${report.aggregate_percent == null ? '' : ` · ${Number(report.aggregate_percent).toFixed(1)}% · Grade ${report.grade ?? '—'}`}`}/>
          {report.position != null && <Tag color="blue">Position #{report.position}</Tag>}
        </List.Item>}/>
      </div>,
    },
    {
      key: 'notifications',
      label: 'Notifications',
      children: notifications.length === 0 ? <Empty description="No notifications" /> : (
        <List
          dataSource={notifications}
          renderItem={(n) => (
            <List.Item>
              <List.Item.Meta
                title={n.title}
                description={n.body}
              />
              {!n.read_at && <Tag color="red">New</Tag>}
            </List.Item>
          )}
        />
      ),
    },
  ]

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <Title level={2}>Parent Portal</Title>
          <Paragraph>View your children's progress, announcements, and notifications.</Paragraph>
        </div>
      </header>
      <Card className="panel-card">
        <Tabs items={items} />
      </Card>
      <Modal title={reportCardQuery.data ? `${reportCardQuery.data.first_name} ${reportCardQuery.data.last_name} · ${reportCardQuery.data.term_name}` : 'Academic report card'} open={!!selectedReport} onCancel={() => setSelectedReport(null)} footer={reportCardQuery.data ? <Button type="primary" onClick={() => downloadReportCardPdf(reportCardQuery.data as ReportCard)}>Download PDF</Button> : null} width={850} destroyOnClose>
        {reportCardQuery.isLoading && <div className="attendance-loading"><Spin/><span>Loading the published report…</span></div>}
        {reportCardQuery.error && <Alert type="error" showIcon message="Could not open this report card" description={formatApiError(reportCardQuery.error)}/>}
        {reportCardQuery.data && <div className="parent-report-card"><div className="parent-report-card-heading"><div><span>{reportCardQuery.data.school_name}</span><h2>Term Report Card</h2><p>{reportCardQuery.data.academic_year_name} · {reportCardQuery.data.term_name}</p></div><Tag color="green">Official · Published</Tag></div>
          <div className="parent-report-student">{[['Student', `${reportCardQuery.data.first_name} ${reportCardQuery.data.last_name}`], ['Admission no.', reportCardQuery.data.admission_number], ['Class', reportCardQuery.data.class_name], ['Grading scale', reportCardQuery.data.grading_scale_name ?? '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          <Table<ReportCardSubject> rowKey="subject_id" columns={reportColumns} dataSource={reportCardQuery.data.subjects} pagination={false} size="small"/>
          <div className="parent-report-summary"><div><span>TERM AVERAGE</span><strong>{Number(reportCardQuery.data.aggregate_percent).toFixed(1)}%</strong></div><div><span>GRADE</span><strong>{reportCardQuery.data.aggregate_grade ?? '—'}</strong></div><div><span>CLASS POSITION</span><strong>{reportCardQuery.data.position == null ? '—' : `${reportCardQuery.data.position} of ${reportCardQuery.data.class_size}`}</strong></div></div>
        </div>}
      </Modal>
    </section>
  )
}
