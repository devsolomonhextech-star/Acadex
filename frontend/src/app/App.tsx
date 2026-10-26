import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Spin } from 'antd'
import { AuthProvider, useAuth } from '../features/auth/authHooks'
import { SchoolLayout } from '../shared/layout/SchoolLayout'
import { AcademicPeriodProvider } from '../shared/academic/AcademicPeriodContext'

const StudentsPage = lazy(() => import('../features/students/StudentsPage'))
const StudentProfilePage = lazy(() => import('../features/students/StudentProfilePage'))
const AcademicPage = lazy(() => import('../features/academic/AcademicPage'))
const TeacherTimetablePage = lazy(() => import('../features/academic/TeacherTimetablePage'))
const TeacherClassRoomPage = lazy(() => import('../features/academic/TeacherClassRoomPage'))
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage'))
const AssessmentsPage = lazy(() => import('../features/assessments/AssessmentsPage'))
const StudentExamsPage = lazy(() => import('../features/assessments/StudentExamsPage'))
const ResultsPage = lazy(() => import('../features/results/ResultsPage'))
const ReportCardPage = lazy(() => import('../features/results/ReportCardPage'))
const FinancePage = lazy(() => import('../features/finance/FinancePage'))
const OverviewPage = lazy(() => import('../features/overview/OverviewPage'))
const ParentsPage = lazy(() => import('../features/parents/ParentsPage'))
const CommunicationsPage = lazy(() => import('../features/communications/CommunicationsPage'))
const AcademicCalendarPage = lazy(() => import('../features/calendar/AcademicCalendarPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const TeacherSettingsPage = lazy(() => import('../features/settings/TeacherSettingsPage'))
const AdmissionsPage = lazy(() => import('../features/admissions/AdmissionsPage'))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'))
const StudentSupportPage = lazy(() => import('../features/student-support/StudentSupportPage'))
const AcceptInvitationPage = lazy(() => import('../features/staff/AcceptInvitationPage'))
const LoginPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.RegisterPage })))
const LandingPage = lazy(() => import('../features/marketing/LandingPage'))

function LoadingPage() {
  return <main className="auth-loading"><Spin size="large"/><span>Checking your school workspace…</span></main>
}

function AuthenticatedLayout() {
  const { user, signOut } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <AcademicPeriodProvider><SchoolLayout user={user} onLogout={() => { void signOut() }}><Outlet /></SchoolLayout></AcademicPeriodProvider>
}

function HomeRoute() {
  const { user, signOut } = useAuth()
  if (!user) return <Suspense fallback={<LoadingPage />}><LandingPage /></Suspense>
  if (user.role === 'student') return <AcademicPeriodProvider><SchoolLayout user={user} onLogout={() => { void signOut() }}><Suspense fallback={<LoadingPage />}><StudentExamsPage /></Suspense></SchoolLayout></AcademicPeriodProvider>
  return <AcademicPeriodProvider><SchoolLayout user={user} onLogout={() => { void signOut() }}><Suspense fallback={<LoadingPage />}><OverviewPage user={user} /></Suspense></SchoolLayout></AcademicPeriodProvider>
}

function LoginRoute() {
  const { user } = useAuth()
  return user ? <Navigate to="/" replace /> : <Suspense fallback={<LoadingPage />}><LoginPage /></Suspense>
}

function RegisterRoute() {
  const { user } = useAuth()
  return user ? <Navigate to="/" replace /> : <Suspense fallback={<LoadingPage />}><RegisterPage /></Suspense>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingPage />
  return <Routes>
    <Route path="/" element={<HomeRoute />} />
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/register" element={<RegisterRoute />} />
    <Route path="/accept-invitation" element={<Suspense fallback={<LoadingPage />}><AcceptInvitationPage /></Suspense>} />
    <Route element={<AuthenticatedLayout />}>
      <Route path="/students" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><StudentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/students/:studentId" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><StudentProfilePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/classes" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AcademicPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/teacher/classes/:classGroupId" element={user?.role === 'teacher' ? <Suspense fallback={<LoadingPage />}><TeacherClassRoomPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/timetable" element={user?.role === 'teacher' ? <Suspense fallback={<LoadingPage />}><TeacherTimetablePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/attendance" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AttendancePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/results" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ResultsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/report-card" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ReportCardPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/assessments" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AssessmentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/student/exams" element={user?.role === 'student' ? <Suspense fallback={<LoadingPage />}><StudentExamsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/finance" element={user && ['school_admin', 'principal', 'finance'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><FinancePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/academic-calendar" element={user && ['school_admin', 'principal', 'registrar', 'teacher', 'finance', 'staff'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AcademicCalendarPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/settings" element={user?.role === 'teacher' ? <Suspense fallback={<LoadingPage />}><TeacherSettingsPage /></Suspense> : user?.role === 'school_admin' ? <Suspense fallback={<LoadingPage />}><SettingsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/parents" element={user && ['parent'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ParentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/communications" element={user && ['school_admin', 'principal'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><CommunicationsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/admissions" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AdmissionsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/reports" element={user && ['school_admin', 'principal', 'registrar', 'teacher', 'finance'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ReportsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/student-support" element={user && ['school_admin', 'principal', 'registrar', 'teacher', 'staff'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><StudentSupportPage /></Suspense> : <Navigate to="/" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
