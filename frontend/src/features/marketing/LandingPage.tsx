import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  MailOutlined,
  MenuOutlined,
  MessageOutlined,
  PhoneOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  TrophyOutlined,
  WalletOutlined,
} from '@ant-design/icons'

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how' },
  { label: 'Security', href: '#trust' },
]

const heroChecks = [
  'No card required to start',
  'Ready in three steps',
  'Your data stays in your workspace',
]

const stats = [
  { icon: <TeamOutlined />, value: 'One place', label: 'School-wide records' },
  { icon: <BookOutlined />, value: 'Every term', label: 'Academic history' },
  { icon: <CalendarOutlined />, value: 'Each day', label: 'Attendance view' },
  { icon: <SafetyCertificateOutlined />, value: 'By role', label: 'Workspace access' },
]

const features = [
  {
    icon: <TeamOutlined />,
    title: 'Student records',
    copy: 'Keep complete student profiles, academic history, and documents in one place.',
    img: '/landing/avatar-student.jpg',
    alt: 'A Ghanaian primary school pupil outside her school canteen',
  },
  {
    icon: <CalendarOutlined />,
    title: 'Attendance',
    copy: 'Track attendance in real time and spot issues early.',
    img: '/landing/feat-attendance.jpg',
    alt: 'Ghanaian pupils writing in class',
  },
  {
    icon: <BarChartOutlined />,
    title: 'Assessments & results',
    copy: 'Create assessments, track progress, and generate reports with ease.',
    img: '/landing/feat-assessment.jpg',
    alt: 'Ghanaian students listening to their teacher',
  },
  {
    icon: <WalletOutlined />,
    title: 'Fees & finance',
    copy: 'Manage fees, payments and financial records with confidence.',
    img: '/landing/feat-fees.jpg',
    alt: 'Ghanaian students learning together with a laptop',
  },
  {
    icon: <ClockCircleOutlined />,
    title: 'Timetable',
    copy: 'Build and manage class schedules, rooms and teachers.',
    img: '/landing/feat-timetable.jpg',
    alt: 'Ghanaian students learning together around a laptop',
  },
  {
    icon: <MessageOutlined />,
    title: 'Parent communication',
    copy: 'Keep parents informed with updates, reports and messages.',
    img: '/landing/feat-parents.jpg',
    alt: 'A Ghanaian teacher showing her pupils something on a phone',
  },
]

const teacherChecks = [
  'Save hours on admin and reporting',
  'Access everything from anywhere',
  'Work with your team, securely and easily',
]

const performanceTabs = [
  {
    key: 'attendance',
    label: 'Attendance',
    value: '96%',
    delta: '+2%',
    note: 'Overall attendance',
    points: [58, 70, 84, 96],
  },
  {
    key: 'results',
    label: 'Results',
    value: '89%',
    delta: '+4%',
    note: 'Average pass rate',
    points: [62, 71, 80, 89],
  },
  {
    key: 'fees',
    label: 'Fees',
    value: '70%',
    delta: '+9%',
    note: 'Fees collected',
    points: [30, 44, 58, 70],
  },
] as const

const progressSubjects = [
  { name: 'Mathematics', pct: 92, color: '#425bcf' },
  { name: 'English', pct: 88, color: '#e0645c' },
  { name: 'Science', pct: 85, color: '#dc9852' },
  { name: 'Social Studies', pct: 90, color: '#22a06b' },
]

const payments = [
  { name: 'Abena Osei', amount: 'GHS 1,200', status: 'Paid' },
  { name: 'Kofi Agyemang', amount: 'GHS 980', status: 'Paid' },
  { name: 'Esi Boateng', amount: 'GHS 1,200', status: 'Pending' },
]

const activityRows = [
  { student: 'Kwame Mensah', cls: 'Grade 7A', event: 'Attendance · Present', time: '08:04 AM' },
  { student: 'Abena Osei', cls: 'Grade 8B', event: 'Assessment · 82%', time: '08:20 AM' },
  { student: 'Kofi Agyemang', cls: 'Grade 6A', event: 'Fee payment', time: '07:54 AM' },
  { student: 'Esi Boateng', cls: 'Grade 9C', event: 'Attendance · Present', time: '07:48 AM' },
]

const mockNav = [
  { icon: <DashboardOutlined />, label: 'Overview', active: true },
  { icon: <TeamOutlined />, label: 'Students' },
  { icon: <CalendarOutlined />, label: 'Attendance' },
  { icon: <ReadOutlined />, label: 'Assessments' },
  { icon: <TrophyOutlined />, label: 'Results' },
  { icon: <WalletOutlined />, label: 'Fees' },
  { icon: <ClockCircleOutlined />, label: 'Timetable' },
  { icon: <MessageOutlined />, label: 'Communication' },
  { icon: <SettingOutlined />, label: 'Settings' },
]

const steps = [
  {
    n: '1',
    title: 'Create your account',
    copy: 'Sign up in minutes and set up your school workspace.',
  },
  {
    n: '2',
    title: 'Add your team',
    copy: 'Invite teachers, staff and administrators to get started.',
  },
  {
    n: '3',
    title: 'Start managing',
    copy: 'Import students or add them manually and begin using Acadex.',
  },
]

const securityChecks = [
  'Each school works in its own workspace',
  'Staff access follows assigned roles',
  'Administrators can enable two-factor sign-in',
  'School records stay within the school workspace',
]

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#product' },
      { label: 'Pricing', href: '#cta' },
      { label: 'How it works', href: '#how' },
      { label: 'Integrations', href: '#insights' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us', href: '#top' },
      { label: 'Careers', href: '#top' },
      { label: 'Blog', href: '#insights' },
      { label: 'Contact', href: 'mailto:hello@acadex.app' },
    ],
  },
  {
    title: 'Security',
    links: [
      { label: 'Privacy', href: '#trust' },
      { label: 'Security', href: '#trust' },
      { label: 'Compliance', href: '#trust' },
      { label: 'Trust', href: '#trust' },
    ],
  },
]

function yFor(value: number) {
  return 14 + ((100 - value) / 100) * 96
}

function PerformanceChart({ points }: { points: readonly number[] }) {
  const xs = [44, 130, 216, 288]
  const coords = points.map((value, index) => `${xs[index]},${yFor(value).toFixed(1)}`)
  return (
    <svg className="lp-chart" viewBox="0 0 300 132" role="img" aria-label="Performance trend">
      {[100, 80, 60, 40, 20].map(tick => (
        <g key={tick}>
          <line x1="30" x2="296" y1={yFor(tick)} y2={yFor(tick)} stroke="#eef1f7" strokeWidth="1" />
          <text x="0" y={yFor(tick) + 3.5} fontSize="9" fill="#9aa0b5">{tick}%</text>
        </g>
      ))}
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="#425bcf"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((value, index) => (
        <circle key={xs[index]} cx={xs[index]} cy={yFor(value)} r="3.6" fill="#fff" stroke="#425bcf" strokeWidth="2.2" />
      ))}
    </svg>
  )
}

function HeroDashboard() {
  return (
    <div className="lp-dash" aria-hidden="true">
      <aside className="lp-dash-side">
        <div className="lp-dash-brand">
          <img src="/brand/acadex-logo.png" alt="" style={{ height: 24, width: 'auto' }} />
        </div>
        <ul>
          {mockNav.map(item => (
            <li key={item.label} className={item.active ? 'on' : undefined}>
              {item.icon}{item.label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="lp-dash-main">
        <div className="lp-dash-top">
          <div>
            <strong>Good morning, Ama</strong>
            <small>Sample school · Week 6 · Term 2</small>
          </div>
          <div className="lp-dash-search"><SearchOutlined /> Search students, classes…</div>
        </div>
        <div className="lp-dash-stats">
          <article>
            <span className="lp-chip blue"><TeamOutlined /></span>
            <small>Students</small>
            <strong>428</strong>
            <em>+12 this term</em>
          </article>
          <article>
            <span className="lp-chip green"><CalendarOutlined /></span>
            <small>Attendance</small>
            <strong>96%</strong>
            <em>+3.5% this week</em>
          </article>
          <article>
            <span className="lp-chip gold"><WalletOutlined /></span>
            <small>Fees collected</small>
            <strong>GHS 84k</strong>
            <em>Term 2 to date</em>
          </article>
          <article>
            <span className="lp-chip red"><ClockCircleOutlined /></span>
            <small>Missed payments</small>
            <strong>18</strong>
            <em>+4 vs last term</em>
          </article>
        </div>
        <div className="lp-dash-activity">
          <header>Recent activity</header>
          <div className="lp-dash-table">
            <div className="lp-dash-row head">
              <span>Student</span><span>Class</span><span>Event</span><span>Time</span>
            </div>
            {activityRows.map(row => (
              <div key={row.student} className="lp-dash-row">
                <span>{row.student}</span><span>{row.cls}</span><span>{row.event}</span><span>{row.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [perfTab, setPerfTab] = useState<(typeof performanceTabs)[number]['key']>('attendance')
  const activePerf = performanceTabs.find(tab => tab.key === perfTab) ?? performanceTabs[0]
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="lp" id="top">
      <a className="lp-skip" href="#main">Skip to content</a>

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand" aria-label="Acadex home">
            <img src="/brand/acadex-logo.png" alt="Acadex" style={{ height: 34, width: 'auto' }} />
          </Link>

          <nav className={`lp-links${menuOpen ? ' is-open' : ''}`} aria-label="Primary">
            {navLinks.map(link => (
              <a key={link.label} href={link.href} onClick={closeMenu}>{link.label}</a>
            ))}
            <Link to="/login" className="lp-nav-signin" onClick={closeMenu}>Sign in</Link>
            <Link to="/register" className="lp-nav-cta" onClick={closeMenu}>
              Set up your school <ArrowRightOutlined />
            </Link>
          </nav>

          <button
            type="button"
            className="lp-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(open => !open)}
          >
            {menuOpen ? <CloseOutlined /> : <MenuOutlined />}
          </button>
        </div>
      </header>

      <main id="main">
        {/* ------------------------------------------------------------- hero */}
        <section className="lp-hero">
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <span className="lp-badge">
                <CheckCircleFilled /> Private workspace for every school
              </span>
              <h1>School operations,<br />kept in one clear place.</h1>
              <p className="lp-lead">
                Acadex brings records, attendance, assessments, results, timetable, and fees into a
                single private workspace — so the everyday work of your school stays together, and
                under your control.
              </p>
              <div className="lp-actions">
                <Link to="/register" className="lp-btn lp-btn-primary">
                  Set up your school <ArrowRightOutlined />
                </Link>
                <Link to="/login" className="lp-btn lp-btn-ghost">Sign in to a workspace</Link>
              </div>
              <ul className="lp-hero-points">
                {heroChecks.map(check => (
                  <li key={check}><CheckCircleFilled /> {check}</li>
                ))}
              </ul>
            </div>

            <div className="lp-hero-visual">
              <div className="lp-hero-photo">
                  <img src="/landing/teacher-laptop.jpg" alt="A Ghanaian headmistress standing with her pupils" />
              </div>
              <HeroDashboard />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- stats band */}
        <section className="lp-stats" aria-label="Acadex at a glance">
          <ul>
            {stats.map(stat => (
              <li key={stat.label}>
                <span className="lp-stats-icon">{stat.icon}</span>
                <div>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------- features */}
        <section id="product" className="lp-section">
          <div className="lp-section-head center">
            <p className="lp-kicker">Features</p>
            <h2>Everything your school needs.<br />Nothing you don’t.</h2>
            <p>
              Powerful, easy-to-use tools designed for modern schools. From student records to
              parent communication, everything works together.
            </p>
          </div>
          <div className="lp-feature-grid">
            {features.map(feature => (
              <article key={feature.title} className="lp-feature">
                <div className="lp-feature-copy">
                  <span className="lp-feature-icon">{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </div>
                <div className="lp-feature-photo">
                    <img src={feature.img} alt={feature.alt} loading="lazy" />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- teacher split */}
        <section className="lp-split">
          <div className="lp-split-photo">
            <img src="/landing/hero-student.jpg" alt="Ghanaian students learning together around a laptop" loading="lazy" />
          </div>
          <div className="lp-split-copy">
            <p className="lp-kicker">For teachers &amp; administrators</p>
            <h2>Less paperwork.<br />More time for teaching.</h2>
            <p>
              Acadex removes the routine admin work so teachers and school leaders can focus on
              what matters most — student success.
            </p>
            <ul className="lp-checks filled">
              {teacherChecks.map(check => (
                <li key={check}><CheckCircleFilled /> {check}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- insights */}
        <section id="insights" className="lp-section lp-section-tint">
          <div className="lp-section-head center">
            <p className="lp-kicker">Insights &amp; analytics</p>
            <h2>Real-time insights for better decisions.</h2>
            <p>
              Get a clear picture of your school’s performance with powerful analytics, student
              progress tracking and fee management.
            </p>
          </div>

          <div className="lp-insight-grid">
            <article className="lp-insight">
              <header className="lp-insight-head">
                <h3>School performance</h3>
                <div className="lp-tabs" role="tablist" aria-label="Performance metric">
                  {performanceTabs.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      id={`lp-tab-${tab.key}`}
                      aria-controls="lp-performance-panel"
                      aria-selected={tab.key === perfTab}
                      className={tab.key === perfTab ? 'on' : undefined}
                      onClick={() => setPerfTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </header>
              <div id="lp-performance-panel" role="tabpanel" aria-labelledby={`lp-tab-${activePerf.key}`}>
                <div className="lp-perf-value">
                  <div>
                    <strong>{activePerf.value}</strong>
                    <span>{activePerf.note}</span>
                  </div>
                  <em>{activePerf.delta} vs last term</em>
                </div>
                <PerformanceChart points={activePerf.points} />
                <div className="lp-chart-x">
                  <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span>
                </div>
              </div>
            </article>

            <article className="lp-insight">
              <header className="lp-insight-head">
                <h3>Student progress</h3>
              </header>
              <div className="lp-progress-student">
                <img src="/landing/avatar-student.jpg" alt="" />
                <div>
                  <strong>Sample learner</strong>
                  <small>Grade 8A · Preview data</small>
                </div>
                <span className="lp-pill ok"><CheckOutlined /> On track</span>
              </div>
              <ul className="lp-progress-list">
                {progressSubjects.map(subject => (
                  <li key={subject.name}>
                    <i style={{ background: subject.color }} />
                    <span>{subject.name}</span>
                    <div className="lp-track">
                      <b style={{ width: `${subject.pct}%`, background: subject.color }} />
                    </div>
                    <em>{subject.pct}%</em>
                  </li>
                ))}
              </ul>
            </article>

            <article className="lp-insight">
              <header className="lp-insight-head">
                <h3>Fee tracking</h3>
              </header>
              <div className="lp-fee-total">
                <small>Total collected</small>
                <strong>GHS 84,320</strong>
                <span>of GHS 120,000</span>
              </div>
              <div className="lp-fee-bar">
                <div className="lp-track"><b style={{ width: '70%' }} /></div>
                <em>70%</em>
              </div>
              <h4 className="lp-subhead">Recent payments</h4>
              <ul className="lp-payments">
                {payments.map(payment => (
                  <li key={payment.name}>
                    <span className="lp-pay-avatar">{payment.name.charAt(0)}</span>
                    <span className="lp-pay-name">{payment.name}</span>
                    <span className="lp-pay-amount">{payment.amount}</span>
                    <span className={`lp-pill ${payment.status === 'Paid' ? 'ok' : 'warn'}`}>
                      {payment.status}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        {/* -------------------------------------------------------------- how */}
        <section id="how" className="lp-section">
          <div className="lp-section-head center">
            <p className="lp-kicker">How it works</p>
            <h2>Get started in three steps.</h2>
            <p>Set up your school, invite your team and start managing — it’s that simple.</p>
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => (
              <li key={step.n}>
                <span className="lp-step-num">{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRightOutlined className="lp-step-arrow" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------- security */}
        <section id="trust" className="lp-security-wrap">
          <div className="lp-security">
            <div className="lp-security-copy">
              <span className="lp-shield"><SafetyCertificateOutlined /></span>
              <p className="lp-kicker">Security &amp; privacy</p>
              <h2>Your school’s data.<br />Your privacy.</h2>
              <p>
                Each school gets a private, secure workspace. Your data is isolated, protected and
                never shared with other schools.
              </p>
            </div>
            <ul className="lp-checks filled">
              {securityChecks.map(check => (
                <li key={check}><CheckCircleFilled /> {check}</li>
              ))}
            </ul>
            <div className="lp-security-photo">
              <img src="/landing/school-campus.jpg" alt="Ghanaian pupils on their school compound" loading="lazy" />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- cta */}
        <section id="cta" className="lp-cta-band">
          <div>
            <p className="lp-cta-kicker">Ready to get started?</p>
            <h2>Bring your school’s work together.</h2>
            <p>
              Give your school a clearer way to organize records, support students and keep your
              team aligned.
            </p>
          </div>
          <Link to="/register" className="lp-btn lp-btn-light">
            Set up your school <ArrowRightOutlined />
          </Link>
        </section>
      </main>

      {/* ------------------------------------------------------------- footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Link to="/" className="lp-brand" aria-label="Acadex home">
              <img src="/brand/acadex-logo.png" alt="Acadex" style={{ height: 38, width: 'auto' }} />
            </Link>
            <p>Better schools. Brighter futures.</p>
          </div>
          {footerColumns.map(column => (
            <nav key={column.title} aria-label={column.title}>
              <h4>{column.title}</h4>
              <ul>
                {column.links.map(link => (
                  <li key={link.label}>
                    {link.href.startsWith('mailto:')
                      ? <a href={link.href}>{link.label}</a>
                      : <a href={link.href}>{link.label}</a>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="lp-footer-contact">
            <h4>Contact</h4>
            <ul>
              <li><MailOutlined /> <a href="mailto:hello@acadex.app">hello@acadex.app</a></li>
              <li><PhoneOutlined /> <a href="tel:+233201234567">+233 20 123 4567</a></li>
              <li><EnvironmentOutlined /> Accra, Ghana</li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-base">
          <span>© 2026 Acadex. All rights reserved.</span>
          <div>
            <a href="#trust">Privacy Policy</a>
            <a href="#trust">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
