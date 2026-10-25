import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Spin } from 'antd'
import { AuthProvider, useAuth } from '../features/auth/authHooks'
import { SchoolLayout } from '../shared/layout/SchoolLayout'

const StudentsPage = lazy(() => import('../features/students/StudentsPage'))
const StudentProfilePage = lazy(() => import('../features/students/StudentProfilePage'))
const AcademicPage = lazy(() => import('../features/academic/AcademicPage'))
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage'))
const AssessmentsPage = lazy(() => import('../features/assessments/AssessmentsPage'))
const ResultsPage = lazy(() => import('../features/results/ResultsPage'))
const ReportCardPage = lazy(() => import('../features/results/ReportCardPage'))
const FinancePage = lazy(() => import('../features/finance/FinancePage'))
const OverviewPage = lazy(() => import('../features/overview/OverviewPage'))
const ParentsPage = lazy(() => import('../features/parents/ParentsPage'))
const CommunicationsPage = lazy(() => import('../features/communications/CommunicationsPage'))
const AcceptInvitationPage = lazy(() => import('../features/staff/AcceptInvitationPage'))
const LoginPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('../features/auth/AuthPages').then(module => ({ default: module.RegisterPage })))

function LoadingPage() {
  return <main className="auth-loading"><Spin size="large"/><span>Checking your school workspace…</span></main>
}

function AuthenticatedLayout() {
  const { user, signOut } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <SchoolLayout user={user} onLogout={() => { void signOut() }}><Outlet /></SchoolLayout>
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
    <Route path="/login" element={<LoginRoute />} />
    <Route path="/register" element={<RegisterRoute />} />
    <Route path="/accept-invitation" element={<Suspense fallback={<LoadingPage />}><AcceptInvitationPage /></Suspense>} />
    <Route element={<AuthenticatedLayout />}>
      <Route path="/" element={user ? <OverviewPage user={user} /> : <Navigate to="/login" replace />} />
      <Route path="/students" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><StudentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/students/:studentId" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><StudentProfilePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/classes" element={user && ['school_admin', 'principal', 'registrar'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AcademicPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/attendance" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AttendancePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/results" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ResultsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/report-card" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ReportCardPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/assessments" element={user && ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><AssessmentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/finance" element={user && ['school_admin', 'principal', 'finance'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><FinancePage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/parents" element={user && ['parent'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><ParentsPage /></Suspense> : <Navigate to="/" replace />} />
      <Route path="/communications" element={user && ['school_admin', 'principal'].includes(user.role) ? <Suspense fallback={<LoadingPage />}><CommunicationsPage /></Suspense> : <Navigate to="/" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
