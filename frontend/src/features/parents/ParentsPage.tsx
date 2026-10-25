import { useQuery } from '@tanstack/react-query'
import { Card, Empty, List, Tag, Tabs, Typography } from 'antd'
import { useAuth } from '../auth/authHooks'
import { fetchAnnouncements, fetchMyChildren, fetchNotifications } from './parentsApi'

const { Title, Paragraph, Text } = Typography

export default function ParentsPage() {
  const { accessToken } = useAuth()
  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'], queryFn: () => fetchMyChildren(accessToken!), enabled: !!accessToken,
  })
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'], queryFn: () => fetchAnnouncements(accessToken!), enabled: !!accessToken,
  })
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'], queryFn: () => fetchNotifications(accessToken!), enabled: !!accessToken,
  })

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
    </section>
  )
}
