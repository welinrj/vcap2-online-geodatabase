import { useState, useEffect, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StaffLogin from './components/StaffLogin'
import { BackgroundGradientAnimation } from './components/ui/background-gradient-animation'
import { getUser } from './services/userStore'
import type { UserProfile } from './types/user'
import './App.css'

const Dashboard = lazy(() => import('./components/portal/Dashboard'))
const GISDatabase = lazy(() => import('./components/portal/GISDatabase'))
const ProtectedAreas = lazy(() => import('./components/portal/ProtectedAreas'))
const ProDocTracker = lazy(() => import('./components/portal/ProDocTracker'))
const ActivityPlanner = lazy(() => import('./components/portal/ActivityPlanner'))
const UserManagement = lazy(() => import('./components/portal/UserManagement'))
const FileManager = lazy(() => import('./components/portal/FileManager'))

const sectionTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'gis-database': 'GIS Database',
  'protected-areas': 'CCAs & MPAs',
  'prodoc-tracker': 'ProDoc Tracker',
  'activity-planner': 'Activity Planner',
  'user-management': 'User Management',
  'file-manager': 'File Manager',
}

/** Sections visible to the public (unauthenticated visitors) */
const PUBLIC_SECTIONS = new Set(['dashboard', 'prodoc-tracker'])

function App() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [staffAuth, setStaffAuth] = useState(
    () => sessionStorage.getItem('vcap2_staff_auth') === '1'
  )
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const userId = sessionStorage.getItem('vcap2_user_id')
    if (staffAuth && userId) {
      getUser(userId).then((user) => {
        if (user) setCurrentUser(user)
      })
    }
  }, [staffAuth])

  const handleLogout = () => {
    sessionStorage.removeItem('vcap2_staff_auth')
    sessionStorage.removeItem('vcap2_user_id')
    setStaffAuth(false)
    setCurrentUser(null)
    setActiveSection('dashboard')
  }

  const handleNavigate = (section: string) => {
    // If not authenticated and trying to access a restricted section, show login
    if (!staffAuth && !PUBLIC_SECTIONS.has(section)) {
      setShowLogin(true)
      return
    }
    setActiveSection(section)
  }

  // Show login modal when requested (either from sidebar button or restricted nav)
  if (showLogin && !staffAuth) {
    return (
      <StaffLogin
        onSuccess={(user) => {
          setStaffAuth(true)
          setCurrentUser(user)
          setShowLogin(false)
        }}
        onCancel={() => {
          setShowLogin(false)
        }}
      />
    )
  }

  const isAuthenticated = staffAuth && currentUser !== null

  return (
    <div className="app-layout">
      <BackgroundGradientAnimation
        gradientBackgroundStart="rgb(241, 245, 249)"
        gradientBackgroundEnd="rgb(236, 253, 245)"
        firstColor="187, 231, 204"
        secondColor="191, 219, 254"
        thirdColor="178, 235, 242"
        fourthColor="221, 214, 254"
        fifthColor="254, 235, 200"
        pointerColor="187, 231, 204"
        interactive={true}
        size="80%"
        blendingValue="normal"
      />
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onLogin={() => setShowLogin(true)}
        user={currentUser}
        isAuthenticated={isAuthenticated}
      />
      <main className="main-content">
        <Header
          title={sectionTitles[activeSection] ?? activeSection}
          user={currentUser}
          isAuthenticated={isAuthenticated}
          onLogin={() => setShowLogin(true)}
        />
        <div className="dashboard-content">
          <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-tertiary)' }}>Loading...</div>}>
          {activeSection === 'dashboard' && <Dashboard />}
          {activeSection === 'gis-database' && isAuthenticated && <GISDatabase />}
          {activeSection === 'protected-areas' && isAuthenticated && <ProtectedAreas />}
          {activeSection === 'prodoc-tracker' && <ProDocTracker readOnly={!isAuthenticated} />}
          {activeSection === 'activity-planner' && isAuthenticated && <ActivityPlanner />}
          {activeSection === 'user-management' && isAuthenticated && <UserManagement currentUser={currentUser} />}
          {activeSection === 'file-manager' && isAuthenticated && <FileManager currentUser={currentUser} />}
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default App
