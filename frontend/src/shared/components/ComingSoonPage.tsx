import { Tag } from 'antd'
import { BookOutlined } from '@ant-design/icons'

export function ComingSoonPage({ title }: { title: string }) {
  return <div className="page-content"><div className="eyebrow">SCHOOL WORKSPACE</div><h1>{title}</h1><section className="panel simple-panel"><div className="simple-icon"><BookOutlined /></div><h2>{title} workspace</h2><p>This area is part of the planned school operations foundation. Its workflows will be connected as the platform modules are built.</p><Tag color="blue">In the roadmap</Tag></section></div>
}
