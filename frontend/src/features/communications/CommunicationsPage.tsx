import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellOutlined, PlusOutlined, ReloadOutlined, SendOutlined, TeamOutlined,
} from '@ant-design/icons'
import {
  Alert, Button, Empty, Form, Input, Segmented, Select, Skeleton, Tabs, Tag, message,
} from 'antd'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { fetchClassGroups } from '../academic/academicApi'
import { fetchStudentOptions } from '../students/studentsApi'
import type { Announcement, NoticeAudience, SchoolNotice } from '../../shared/api/types'
import {
  createAnnouncement, fetchAnnouncements, fetchNoticePreview, fetchSentNotices, sendNotice,
} from './communicationsApi'

const { TextArea } = Input

const AUDIENCE_LABELS: Record<string, string> = {
  all_parents: 'All parents',
  class: 'One class',
  student: 'One child',
}

const AUDIENCE_OPTIONS = [
  { value: 'all_parents', label: 'All parents' },
  { value: 'class', label: 'One class' },
  { value: 'student', label: 'One child' },
]

const ANNOUNCEMENT_AUDIENCES: Record<string, string> = {
  all: 'Everyone',
  staff: 'Staff',
  parents: 'Parents',
  students: 'Students',
  class: 'One class',
}

export default function CommunicationsPage() {
  const { accessToken, user } = useAuth()
  const { yearId } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('notify')
  const [noticeForm] = Form.useForm()
  const [announcementForm] = Form.useForm()
  const [announcementAudience, setAnnouncementAudience] = useState('all')
  const canManage = ['school_admin', 'principal'].includes(user?.role ?? '')

  const audience: NoticeAudience = Form.useWatch('audience', noticeForm) ?? 'all_parents'
  const classId: string | undefined = Form.useWatch('class_group_id', noticeForm)
  const studentId: string | undefined = Form.useWatch('student_id', noticeForm)
  const targetChosen = audience === 'all_parents' || (audience === 'class' ? Boolean(classId) : Boolean(studentId))

  const sentNotices = useQuery({
    queryKey: ['sent-notices'],
    queryFn: () => fetchSentNotices(accessToken!),
    enabled: Boolean(accessToken) && canManage,
  })
  const classes = useQuery({
    queryKey: ['class-groups', yearId],
    queryFn: () => fetchClassGroups(accessToken!, yearId),
    enabled: Boolean(accessToken) && Boolean(yearId) && canManage,
  })
  const students = useQuery({
    queryKey: ['student-options'],
    queryFn: () => fetchStudentOptions(accessToken!),
    enabled: Boolean(accessToken) && canManage,
  })
  const preview = useQuery({
    queryKey: ['notice-preview', audience, classId, studentId],
    queryFn: () => fetchNoticePreview(accessToken!, {
      audience,
      classGroupId: classId,
      studentId,
    }),
    enabled: Boolean(accessToken) && canManage && targetChosen,
    retry: false,
  })
  const announcements = useQuery({
    queryKey: ['announcements'],
    queryFn: () => fetchAnnouncements(accessToken!),
    enabled: Boolean(accessToken) && canManage,
  })

  const sendMutation = useMutation({
    mutationFn: (values: { title: string; body: string; audience: NoticeAudience; class_group_id?: string; student_id?: string }) =>
      sendNotice(accessToken!, {
        title: values.title,
        body: values.body,
        audience: values.audience,
        class_group_id: values.audience === 'class' ? values.class_group_id : null,
        student_id: values.audience === 'student' ? values.student_id : null,
      }),
    onSuccess: (notice) => {
      message.success(
        `Notification sent to ${notice.recipient_count} parent${notice.recipient_count === 1 ? '' : 's'}`,
      )
      noticeForm.resetFields()
      noticeForm.setFieldsValue({ audience: 'all_parents' })
      void queryClient.invalidateQueries({ queryKey: ['sent-notices'] })
      void queryClient.invalidateQueries({ queryKey: ['notice-preview'] })
    },
    onError: (error) => message.error(formatApiError(error)),
  })

  const announcementMutation = useMutation({
    mutationFn: (values: { title: string; body: string; audience: string; class_group_id?: string }) =>
      createAnnouncement(accessToken!, {
        title: values.title,
        body: values.body,
        audience: values.audience,
        class_group_id: values.audience === 'class' ? values.class_group_id : null,
      }),
    onSuccess: () => {
      message.success('Announcement published')
      announcementForm.resetFields()
      setAnnouncementAudience('all')
      void queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (error) => message.error(formatApiError(error)),
  })

  if (!canManage) {
    return (
      <section className="page-section comms-page">
        <Alert type="info" showIcon message="Communications is available to school administrators and principals." />
      </section>
    )
  }

  const recipients = preview.data?.recipients
  const notices = sentNotices.data ?? []
  const announcementItems = announcements.data ?? []

  const previewNote = (() => {
    if (!targetChosen) {
      return <span>Choose a {audience === 'class' ? 'class' : 'child'} to see who this reaches.</span>
    }
    if (preview.isLoading) return <span>Counting recipients…</span>
    if (preview.isError) return <span className="comms-audience-error">{formatApiError(preview.error)}</span>
    const count = recipients ?? 0
    return (
      <>
        <BellOutlined />
        <span>
          Will reach <strong>{count}</strong> parent account{count === 1 ? '' : 's'}
          {count === 0 ? ' — no parent has the app yet' : ' in the app and by push'}
        </span>
      </>
    )
  })()

  const notifyPanel = (
    <div className="comms-notices">
      <section className="comms-compose">
        <header>
          <h2>Send a notification</h2>
          <p>Delivered instantly to the parent app — an alert in Updates and a push to their phone.</p>
        </header>
        <Form
          form={noticeForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{ audience: 'all_parents' }}
          onFinish={values => sendMutation.mutate(values)}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Add a short title' }]}>
            <Input maxLength={160} showCount placeholder="e.g. School closes early on Friday" />
          </Form.Item>
          <Form.Item name="body" label="Message" rules={[{ required: true, message: 'Write the message' }]}>
            <TextArea
              rows={4} maxLength={1000} showCount
              placeholder="Keep it short and specific — this appears as a phone notification."
            />
          </Form.Item>
          <Form.Item name="audience" label="Send to">
            <Segmented block options={AUDIENCE_OPTIONS} />
          </Form.Item>
          {audience === 'class' && (
            <Form.Item
              name="class_group_id" label="Class"
              rules={[{ required: true, message: 'Choose the class' }]}
            >
              <Select
                placeholder="Choose a class"
                loading={classes.isLoading}
                options={(classes.data ?? []).map(group => ({
                  value: group.id, label: `${group.name} · ${group.stream}`,
                }))}
              />
            </Form.Item>
          )}
          {audience === 'student' && (
            <Form.Item
              name="student_id" label="Child"
              rules={[{ required: true, message: 'Choose the child' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Search for a student"
                loading={students.isLoading}
                options={(students.data?.items ?? []).map(student => ({
                  value: student.id,
                  label: `${student.first_name} ${student.last_name} · ${student.admission_number}`,
                }))}
              />
            </Form.Item>
          )}
          <div className="comms-send-row">
            <div className={`comms-audience-note${recipients === 0 ? ' is-empty' : ''}`}>{previewNote}</div>
            <Button
              type="primary" htmlType="submit" icon={<SendOutlined />}
              loading={sendMutation.isPending}
              disabled={!targetChosen || recipients === 0}
            >
              Send notification
            </Button>
          </div>
        </Form>
      </section>

      <section className="comms-feed">
        <header>
          <h2>Recently sent</h2>
          <p>{notices.length} notification{notices.length === 1 ? '' : 's'} to families</p>
        </header>
        {sentNotices.isLoading && <Skeleton active paragraph={{ rows: 4 }} />}
        {sentNotices.isError && (
          <Alert
            type="error" showIcon message="Could not load sent notifications"
            description={formatApiError(sentNotices.error)}
            action={<Button size="small" onClick={() => void sentNotices.refetch()}>Retry</Button>}
          />
        )}
        {!sentNotices.isLoading && notices.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing sent yet. Your first notification will appear here."
          />
        )}
        <div className="comms-feed-list">
          {notices.map(notice => <NoticeCard key={notice.id} notice={notice} />)}
        </div>
      </section>
    </div>
  )

  const announcementsPanel = (
    <div className="comms-notices">
      <section className="comms-compose">
        <header>
          <h2>Publish an announcement</h2>
          <p>Announcements sit on the school notice board in the parent app and family portal.</p>
        </header>
        <Form
          form={announcementForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{ audience: 'all' }}
          onFinish={values => announcementMutation.mutate(values)}
          onValuesChange={changed => { if (changed.audience) setAnnouncementAudience(changed.audience) }}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Add a short title' }]}>
            <Input maxLength={160} placeholder="e.g. Mid-term break starts Friday" />
          </Form.Item>
          <Form.Item name="audience" label="Audience">
            <Select
              options={[
                { value: 'all', label: 'Everyone in the school' },
                { value: 'parents', label: 'Parents only' },
                { value: 'staff', label: 'Staff only' },
                { value: 'students', label: 'Students only' },
                { value: 'class', label: 'One class' },
              ]}
            />
          </Form.Item>
          {announcementAudience === 'class' && (
            <Form.Item
              name="class_group_id" label="Class"
              rules={[{ required: true, message: 'Choose the class for this announcement' }]}
            >
              <Select
                loading={classes.isLoading}
                placeholder="Choose a class"
                options={(classes.data ?? []).map(group => ({
                  value: group.id, label: `${group.name} · ${group.stream}`,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="body" label="Message" rules={[{ required: true, message: 'Write the announcement' }]}>
            <TextArea rows={6} maxLength={4000} showCount placeholder="What should families know?" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={announcementMutation.isPending} icon={<SendOutlined />}>
            Publish announcement
          </Button>
        </Form>
      </section>

      <section className="comms-feed">
        <header>
          <h2>Published</h2>
          <p>{announcementItems.length} announcement{announcementItems.length === 1 ? '' : 's'} on record</p>
        </header>
        {announcements.isLoading && <Skeleton active paragraph={{ rows: 3 }} />}
        {announcements.isError && (
          <Alert type="error" showIcon message="Could not load announcements" description={formatApiError(announcements.error)} />
        )}
        {announcements.data?.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Publish your first announcement to reach families." />
        )}
        <div className="comms-feed-list">
          {announcementItems.map(item => <AnnouncementCard key={item.id} announcement={item} />)}
        </div>
      </section>
    </div>
  )

  return (
    <section className="page-section comms-page">
      <header className="comms-heading">
        <div>
          <span className="comms-eyebrow">COMMUNICATIONS</span>
          <h1>Reach families</h1>
          <p>Notifications alert parents instantly; announcements stay on the school notice board.</p>
        </div>
        <div className="comms-heading-actions">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { void sentNotices.refetch(); void announcements.refetch() }}
            loading={sentNotices.isFetching}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setTab('announcements')}>
            New announcement
          </Button>
        </div>
      </header>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        className="comms-tabs"
        items={[
          { key: 'notify', label: 'Send notification', children: notifyPanel },
          { key: 'announcements', label: 'Announcements', children: announcementsPanel },
        ]}
      />
    </section>
  )
}

function NoticeCard({ notice }: { notice: SchoolNotice }) {
  const audience = AUDIENCE_LABELS[notice.audience] ?? notice.audience
  return (
    <article className="comms-feed-card">
      <header>
        <h3>{notice.title}</h3>
        <Tag className="comms-tag">
          {audience}{notice.target_name ? ` · ${notice.target_name}` : ''}
        </Tag>
      </header>
      <p>{notice.body}</p>
      <footer>
        <span><TeamOutlined /> {notice.recipient_count} parent{notice.recipient_count === 1 ? '' : 's'}</span>
        <span>{notice.sent_by}</span>
        <span>{dayjs(notice.created_at).format('D MMM YYYY, HH:mm')}</span>
      </footer>
    </article>
  )
}

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  return (
    <article className="comms-feed-card">
      <header>
        <h3>{announcement.title}</h3>
        <Tag className="comms-tag">{ANNOUNCEMENT_AUDIENCES[announcement.audience] ?? announcement.audience}</Tag>
      </header>
      <p>{announcement.body}</p>
      <footer>
        <span>{dayjs(announcement.published_at).format('D MMM YYYY, HH:mm')}</span>
        {announcement.expires_at && <span>Expires {dayjs(announcement.expires_at).format('D MMM YYYY')}</span>}
        <span className={`comms-pill comms-pill-${announcement.status === 'published' ? 'ok' : 'info'}`}>
          {announcement.status === 'published' ? 'Live' : announcement.status}
        </span>
      </footer>
    </article>
  )
}
