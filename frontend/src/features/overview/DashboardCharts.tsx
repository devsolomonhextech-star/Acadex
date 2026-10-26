import type { CSSProperties } from 'react'

export type DonutSegment = { label: string; value: number; color: string }

export function DonutChart({ title, subtitle, segments, centerValue, centerLabel }: {
  title: string; subtitle: string; segments: DonutSegment[]; centerValue: string; centerLabel: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  let cursor = 0
  const stops = segments.filter(segment => segment.value > 0).map(segment => {
    const start = cursor / Math.max(total, 1) * 100
    cursor += segment.value
    const end = cursor / Math.max(total, 1) * 100
    return `${segment.color} ${start}% ${end}%`
  })
  const style = { '--donut-fill': total ? `conic-gradient(${stops.join(', ')})` : '#edf1f7' } as CSSProperties

  return <article className="dashboard-chart-card">
    <div className="dashboard-chart-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
    {total ? <div className="dashboard-donut-layout">
      <div className="dashboard-donut" style={style} role="img" aria-label={`${title}: ${segments.map(item => `${item.label} ${item.value}`).join(', ')}`}>
        <div className="dashboard-donut-hole"><strong>{centerValue}</strong><span>{centerLabel}</span></div>
      </div>
      <ul className="dashboard-chart-legend">
        {segments.map(segment => <li key={segment.label}><span className="dashboard-legend-label"><i style={{ backgroundColor: segment.color }} />{segment.label}</span><strong>{segment.value.toLocaleString()}</strong></li>)}
      </ul>
    </div> : <div className="dashboard-chart-empty">No records available for this period yet.</div>}
  </article>
}

export function WeeklyBarChart({ title, subtitle, values, formatValue }: {
  title: string; subtitle: string; values: { label: string; value: number }[]; formatValue?: (value: number) => string
}) {
  const max = Math.max(...values.map(item => item.value), 0)
  const hasValues = values.some(item => item.value > 0)
  return <article className="dashboard-chart-card">
    <div className="dashboard-chart-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
    {values.length && hasValues ? <div className="dashboard-bars" role="img" aria-label={`${title}: ${values.map(item => `${item.label} ${formatValue ? formatValue(item.value) : item.value}`).join(', ')}`}>
      {values.map(item => <div className="dashboard-bar-column" key={item.label} title={`${item.label}: ${formatValue ? formatValue(item.value) : item.value}`}>
        <span className="dashboard-bar-value">{formatValue ? formatValue(item.value) : item.value.toLocaleString()}</span>
        <div className="dashboard-bar-track"><i style={{ height: `${Math.max(item.value > 0 ? 4 : 0, max ? item.value / max * 100 : 0)}%` }} /></div>
        <span className="dashboard-bar-label">{item.label}</span>
      </div>)}
    </div> : <div className="dashboard-chart-empty">{values.length ? 'No activity recorded for this period yet.' : 'No weekly data available yet.'}</div>}
  </article>
}

export function ClassAttendanceChart({ rows }: { rows: { id: string; name: string; rate: number | null }[] }) {
  const hasValues = rows.some(row => row.rate != null)
  return <article className="dashboard-chart-card dashboard-class-chart">
    <div className="dashboard-chart-heading"><div><h2>Attendance by class</h2><p>Today’s recorded attendance across your classes</p></div></div>
    {rows.length && hasValues ? <div className="dashboard-rate-list">
      {rows.map(row => <div className="dashboard-rate-row" key={row.id}>
        <span className="dashboard-rate-name" title={row.name}>{row.name}</span>
        <div className="dashboard-rate-track"><i style={{ width: `${Math.max(0, Math.min(100, row.rate ?? 0))}%` }} /></div>
        <strong>{row.rate == null ? '—' : `${row.rate}%`}</strong>
      </div>)}
    </div> : <div className="dashboard-chart-empty">Attendance will appear when a class teacher records today’s roll.</div>}
  </article>
}
