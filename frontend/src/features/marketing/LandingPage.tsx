import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Form, Input, Modal, message } from 'antd'
import { PhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import {
  ArrowRightOutlined,
  BankOutlined,
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
  HeartFilled,
  HomeOutlined,
} from '@ant-design/icons'

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'How it works', href: '#how' },
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
    title: 'Choose your student plan',
    copy: 'Select the student places you need at GH₵3 per student each month.',
  },
  {
    n: '3',
    title: 'Bring everyone together',
    copy: 'Invite your team, add students and connect families through the parent portal.',
  },
]

const securityChecks = [
  'Each school works in its own workspace',
  'Staff access follows assigned roles',
  'Administrators can enable two-factor sign-in',
  'School records stay within the school workspace',
]

const faqItems = [
  { question: 'Is there a setup fee?', answer: 'No. Installation, configuration and staff training are included at no extra cost.' },
  { question: 'How long is the free period?', answer: 'Your first three months on Acadex are free, with no card required to get started. The free period includes the software, setup, staff training and access to both Android apps.' },
  { question: 'When do we start paying?', answer: 'There is no software subscription charge during your first three months. If you choose to continue, Acadex is GH₵3 per enrolled student per month, quoted and billed at the start of each term. Payment processing charges and optional messaging or device arrangements are discussed separately.' },
  { question: 'What if our student count changes?', answer: 'Your term quote is based on enrollment at the start of the term. New admissions during that term are included at no extra subscription charge.' },
  { question: 'Is training included?', answer: 'Yes. We provide onboarding and comprehensive training for your staff at no additional cost, along with ongoing support.' },
  { question: 'Are updates and maintenance included?', answer: 'Software updates and system maintenance are included while your school subscribes. We can also walk you through data exports and backup arrangements during setup.' },
  { question: 'Is there a minimum contract period?', answer: 'No long-term contract is required. You choose whether to continue term by term.' },
  { question: 'How do we get technical support?', answer: 'Reach the Acadex team on +233 53 670 2357 by phone or WhatsApp, or by email. We will explain support hours and urgent support arrangements during setup.' },
  { question: 'Can we get a demo first?', answer: 'Absolutely. We offer free, personalized demos so your team can see how Acadex works for your school.' },
]

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#product' },
      { label: 'Pricing', href: '#pricing' },
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
      { label: 'Security', href: '#trust' }, { label: 'FAQs', href: '#faq' },
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

function ParentMobilePreview() {
  return <div className="lp-parent-phone" aria-label="Acadex parent portal mobile preview">
    <div className="lp-parent-phone-shell">
      <span className="lp-parent-phone-camera" />
      <div className="lp-parent-phone-screen">
        <div className="lp-parent-status"><span>9:41</span><span>●●●　◖　▰</span></div>
        <div className="lp-parent-greeting"><div><small>SAMPLE PORTAL · TERM 2</small><strong>Good morning, Ama</strong></div><span>AM</span></div>
        <div className="lp-parent-student"><img src="/landing/avatar-student.jpg" alt=""/><div><strong>Esi Mensah</strong><small>Grade 7A · Greenwood Academy</small></div><span>⌄</span></div>
        <div className="lp-parent-attendance"><span><CalendarOutlined /></span><div><small>ATTENDANCE THIS TERM</small><strong>96% <em>On track</em></strong></div><div className="lp-parent-ring"><b>96</b></div></div>
        <div className="lp-parent-phone-heading"><strong>School updates</strong><a href="#product">See all</a></div>
        <article className="lp-parent-update"><span className="lp-parent-update-icon blue"><BookOutlined /></span><div><strong>New assessment result</strong><small>Mathematics · 87% · Today</small></div><i /></article>
        <article className="lp-parent-update"><span className="lp-parent-update-icon green"><MessageOutlined /></span><div><strong>Class announcement</strong><small>Grade 7A · Yesterday</small></div><i /></article>
        <div className="lp-parent-phone-nav"><span className="active"><DashboardOutlined />Home</span><span><CalendarOutlined />Progress</span><span><MessageOutlined />Updates</span></div>
      </div>
    </div>
  </div>
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoPhone, setDemoPhone] = useState('+233')
  const [demoForm] = Form.useForm<{
    school: string
    email: string
    services?: string
  }>()
  const [perfTab, setPerfTab] = useState<(typeof performanceTabs)[number]['key']>('attendance')
  const [pricePreviewCapacity, setPricePreviewCapacity] = useState(100)
  const activePerf = performanceTabs.find(tab => tab.key === perfTab) ?? performanceTabs[0]
  const closeMenu = () => setMenuOpen(false)
  const openDemo = () => {
    closeMenu()
    setDemoOpen(true)
  }
  const submitDemoRequest = (values: { school: string; email: string; services?: string }) => {
    if (demoPhone.replace(/\D/g, '').length < 9) {
      message.error('Enter a complete WhatsApp or phone number.')
      return
    }
    const messageText = [
      'Hello Acadex, I would like to request a school demo.',
      `School: ${values.school}`,
      `Email: ${values.email}`,
      `WhatsApp/phone: ${demoPhone}`,
      values.services ? `Services needed: ${values.services}` : '',
      'Please let me know the next steps and how demo credentials will be shared.',
    ].filter(Boolean).join('\n')
    window.open(`https://wa.me/233536702357?text=${encodeURIComponent(messageText)}`, '_blank', 'noopener,noreferrer')
    message.success('Your WhatsApp request is ready. Send it to connect with the Acadex team.')
    setDemoOpen(false)
    demoForm.resetFields()
    setDemoPhone('+233')
  }

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
            <button type="button" className="lp-nav-cta" onClick={openDemo}>Request a demo <ArrowRightOutlined /></button>
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

        <section className="lp-connected" aria-labelledby="lp-connected-title">
          <div className="lp-connected-main">
            <div className="lp-connected-copy">
              <h2 id="lp-connected-title">One school.<br/>Everyone connected.</h2>
              <p>Give the office, teachers and families a shared place to stay up to date.</p>
            </div>
            <div className="lp-connected-network" aria-label="Acadex connects the office, teachers and families">
              <div className="lp-connected-hub"><BankOutlined/><strong>Acadex</strong></div>
              <div className="lp-connected-branches">
                <article><span className="lp-connected-node"><BankOutlined/></span><strong>The office</strong><small>Admissions &amp; fees</small></article>
                <article><span className="lp-connected-node"><TeamOutlined/></span><strong>Teachers</strong><small>Attendance &amp; learning</small></article>
                <article><span className="lp-connected-node"><HomeOutlined/></span><strong>Families</strong><small>Updates &amp; reports</small></article>
              </div>
            </div>
          </div>
          <div className="lp-connected-offer"><p><strong>Your first 3 months are free.</strong><span>Try the full Acadex system with your school. No card required.</span></p><a href="#pricing">See how pricing works <ArrowRightOutlined/></a></div>
        </section>

        <section className="lp-school-overview" aria-labelledby="lp-school-overview-title">
          <div className="lp-school-types" aria-label="Acadex is designed for different kinds of schools">
            <span className="lp-school-types-title">Made for schools of every size</span>
            <div>{['Basic schools', 'Academies', 'Junior high', 'Senior high', 'Montessori'].map((type, index) => <span className="lp-school-type" key={type}><i aria-hidden="true">{['B', 'A', 'J', 'S', 'M'][index]}</i>{type}</span>)}</div>
          </div>
          <div className="lp-school-overview-main">
            <div className="lp-school-overview-intro">
              <h2 id="lp-school-overview-title">A shared place for the whole school.</h2>
              <p>The office, classroom and home all depend on the same information. Keep it connected, without another spreadsheet to update.</p>
              <a href="#product">See all features <ArrowRightOutlined/></a>
            </div>
            <div className="lp-school-benefits">
              <article>
                <WalletOutlined className="lp-school-benefit-icon"/>
                <div><h3>Know what’s been paid. See what’s still due.</h3><p>Bring term bills, discounts, receipts and arrears into one student account. Give parents online payment options and let authorised cashiers record collections from a phone.</p><div className="lp-school-benefit-links"><a href="#product">Student records</a><a href="#pricing">Fees and payments</a></div></div>
              </article>
              <article>
                <BookOutlined className="lp-school-benefit-icon"/>
                <div><h3>From the lesson to the term report.</h3><p>Keep lessons, assessments and results connected. Teachers can manage class work, review student progress and prepare term reports without entering the same scores again.</p><div className="lp-school-benefit-links"><a href="#product">Lessons and exams</a><a href="#insights">Assessment and reports</a></div></div>
              </article>
              <article>
                <MessageOutlined className="lp-school-benefit-icon"/>
                <div><h3>Answers for parents, without another office visit.</h3><p>Families can check their children’s balances, attendance and published reports from their phone. School announcements, messages and payment history stay within reach.</p><div className="lp-school-benefit-links"><a href="#product">Explore the parent portal</a></div></div>
              </article>
            </div>
          </div>
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

        {/* --------------------------------------------------------- pricing + families */}
        <section id="pricing" className="lp-pricing-section">
          <div className="lp-pricing-layout">
            <article className="lp-pricing-card">
              <span className="lp-plan-label">Simple school pricing</span>
              <h2>School management that fits your budget.</h2>
              <p>Acadex is designed to make great school tools accessible to institutions of every size.</p>
              <div className="lp-plan-price"><strong>GH₵3</strong><span>per student<br />each month</span></div>
              <label className="lp-capacity-label" htmlFor="lp-capacity">Estimate monthly cost after your free period</label>
              <input id="lp-capacity" type="range" min="50" max="1000" step="50" value={pricePreviewCapacity} onChange={event => setPricePreviewCapacity(Number(event.target.value))} />
              <div className="lp-capacity-output"><span>{pricePreviewCapacity.toLocaleString()} student places</span><strong>GH₵{(pricePreviewCapacity * 3).toLocaleString()}<small> / month</small></strong></div>
              <ul className="lp-plan-benefits">
                <li><CheckCircleFilled /> Choose the number of student places your school needs</li>
                <li><CheckCircleFilled /> Pay at the start of each term</li>
                <li><CheckCircleFilled /> Add more places as your school grows</li>
              </ul>
              <Link to="/register" className="lp-btn lp-btn-primary">Set up your school <ArrowRightOutlined /></Link>
              <small className="lp-plan-footnote">If you continue, your term quote is based on enrollment at the start of each term.</small>
              <div className="lp-community-commitment">
                <span className="lp-community-icon"><HeartFilled /></span>
                <div><strong>Every subscription gives back</strong><p>Acadex dedicates 10% of subscription revenue to supporting orphanage homes in Ghana. Your school’s tools can help more children access care and learning support.</p></div>
                <span className="lp-community-share">10%</span>
              </div>
            </article>
            <article className="lp-parent-card">
              <div className="lp-parent-copy">
                <span className="lp-plan-label">For parents and guardians</span>
                <h2>School updates, right in your pocket.</h2>
                <p>Parents can sign in from a phone to stay close to their child’s school life.</p>
                <ul className="lp-parent-benefits">
                  <li><CalendarOutlined /><span><strong>Follow attendance</strong><small>See school attendance at a glance.</small></span></li>
                  <li><BookOutlined /><span><strong>Keep up with learning</strong><small>Check published results and progress.</small></span></li>
                  <li><MessageOutlined /><span><strong>Stay informed</strong><small>Read announcements and school updates.</small></span></li>
                </ul>
              </div>
              <ParentMobilePreview />
            </article>
          </div>
        </section>

                {/* ------------------------------------------------------ FAQs + next steps */}
        <section id="faq" className="lp-section lp-faq-section">
          <div className="lp-section-head center">
            <p className="lp-kicker">Frequently asked questions</p>
            <h2>Clear answers for your school.</h2>
            <p>Here is what to expect when you bring your school onto Acadex.</p>
          </div>
          <div className="lp-faq-grid">
            {faqItems.map((item, index) => (
              <details className="lp-faq-item" key={item.question} open={index === 0}>
                <summary>{item.question}<span aria-hidden="true" /></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-trial-followup" aria-labelledby="lp-trial-followup-title">
          <div className="lp-trial-followup-copy">
            <p className="lp-kicker">After your free three months</p>
            <h2 id="lp-trial-followup-title">Continue with clear, term-by-term pricing.</h2>
            <p>If you choose to continue, we will prepare a quote using your school’s enrollment and explain any separate payment processing or optional service costs before you decide.</p>
            <ul>
              <li><CheckCircleFilled /> One per-student software subscription</li>
              <li><CheckCircleFilled /> A quote based on your school’s enrollment</li>
              <li><CheckCircleFilled /> Pay term by term, with no long-term contract</li>
            </ul>
          </div>
          <div className="lp-trial-followup-actions">
            <a className="lp-btn lp-btn-primary" href="mailto:hello@acadex.app?subject=Acadex%20school%20quote">Get a quote for my school <ArrowRightOutlined /></a>
            <a className="lp-btn lp-btn-ghost" href="https://wa.me/233536702357?text=Hello%20Acadex%2C%20I%E2%80%99d%20like%20to%20ask%20about%20a%20school%20quote." target="_blank" rel="noreferrer">Ask on WhatsApp <MessageOutlined /></a>
            <small>We’ll help you choose the right plan before any paid term begins.</small>
          </div>
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

      <Modal
        title={<div className="lp-demo-modal-heading"><span className="lp-demo-modal-icon"><CalendarOutlined /></span><div><strong>Request an Acadex demo</strong><small>Tell us about your school and how to reach you.</small></div></div>}
        open={demoOpen}
        onCancel={() => setDemoOpen(false)}
        footer={null}
        destroyOnHidden
        className="lp-demo-modal"
      >
        <p className="lp-demo-modal-note">Our team will follow up to arrange your demo and share access credentials with you.</p>
        <Form form={demoForm} layout="vertical" requiredMark={false} onFinish={submitDemoRequest}>
          <Form.Item name="school" label="School name" rules={[{ required: true, message: 'Enter your school name.' }]}>
            <Input size="large" placeholder="e.g. Greenwood Academy" autoComplete="organization" />
          </Form.Item>
          <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}>
            <Input size="large" type="email" placeholder="you@school.edu.gh" autoComplete="email" />
          </Form.Item>
          <Form.Item label="WhatsApp or phone number" required>
            <PhoneInput
              defaultCountry="gh"
              value={demoPhone}
              onChange={setDemoPhone}
              inputProps={{ 'aria-label': 'WhatsApp or phone number', autoComplete: 'tel' }}
              inputClassName="lp-demo-phone-input"
              className="lp-demo-phone"
            />
          </Form.Item>
          <Form.Item name="services" label="What would you like to explore?">
            <Input.TextArea rows={3} placeholder="For example: student records, fees, attendance, parent app…" />
          </Form.Item>
          <div className="lp-demo-modal-contact"><MessageOutlined /><span>Acadex WhatsApp</span><a href="https://wa.me/233536702357" target="_blank" rel="noreferrer">+233 53 670 2357</a></div>
          <p className="lp-demo-email-help">Prefer email? <a href="mailto:hello@acadex.app">hello@acadex.app</a></p>
          <Button type="primary" htmlType="submit" size="large" block className="lp-demo-submit">Continue on WhatsApp <ArrowRightOutlined /></Button>
          <p className="lp-demo-modal-footnote">Your request opens a WhatsApp message to Acadex with the details you provided. You can review it before sending.</p>
        </Form>
      </Modal>

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
