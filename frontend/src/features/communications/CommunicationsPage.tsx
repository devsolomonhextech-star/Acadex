import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Form, Input, List, Modal, Select, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAuth } from '../auth/authHooks'
import { createAnnouncement, fetchAnnouncements } from './communicationsApi'

const { Title, Paragraph } = Typography
const { TextArea } = Input

export default function CommunicationsPage() {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => fetchAnnouncements(accessToken!),
    enabled: !!accessToken,
  })
  const mutation = useMutation({
    mutationFn: (values: Parameters<typeof createAnnouncement>[1]) => createAnnouncement(accessToken!, values),
    onSuccess: () => {
      message.success('Announcement published')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      setOpen(false)
      form.resetFields()
    },
    onError: () => message.error('Failed to publish announcement'),
  })

  return (
    <section className="page-section">
      <header className="page-header">
        <div>
          <Title level={2}>Communications</Title>
          <Paragraph>Publish announcements and manage school communications.</Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New announcement</Button>
      </header>
      <Card className="panel-card" loading={isLoading}>
        <List
          dataSource={announcements}
          renderItem={(ann) => (
            <List.Item>
              <List.Item.Meta
                title={<><strong>{ann.title}</strong> <span style={{ color: '#8c8c8c', fontWeight: 400 }}>• {ann.audience}</span></>}
                description={<div style={{ whiteSpace: 'pre-wrap' }}>{ann.body}</div>}
              />
              <span style={{ color: '#8c8c8c' }}>{new Date(ann.published_at).toLocaleString()}</span>
            </List.Item>
          )}
        />
      </Card>
      <Modal title="Publish announcement" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={mutation.isPending}>
        <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="body" label="Message" rules={[{ required: true }]}><TextArea rows={4} /></Form.Item>
          <Form.Item name="audience" label="Audience" initialValue="all"><Select options={[{ value: 'all', label: 'All' }, { value: 'staff', label: 'Staff' }, { value: 'parents', label: 'Parents' }, { value: 'students', label: 'Students' }, { value: 'class', label: 'Specific class' }]} /></Form.Item>
        </Form>
      </Modal>
    </section>
  )
}
