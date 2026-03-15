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

const sectionTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'gis-database': 'GIS Database',
  'protected-areas': 'CCAs & MPAs',
  'prodoc-tracker': 'ProDoc Tracker',
  'activity-planner': 'Activity Planner',
}

function App() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [staffAuth, setStaffAuth] = useState(
    () => sessionStorage.getItem('vcap2_staff_auth') === '1'
  )
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)

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

  if (!staffAuth) {
    return (
      <StaffLogin
        onSuccess={(user) => {
          setStaffAuth(true)
          setCurrentUser(user)
          setActiveSection('dashboard')
        }}
        onCancel={() => {
          // No-op: login is the only entry point
        }}
      />
    )
  }

  return (
    <div className="app-layout">
      <BackgroundGradientAnimation
        gradientBackgroundStart="rgb(15, 23, 42)"
        gradientBackgroundEnd="rgb(8, 47, 73)"
        firstColor="34, 197, 94"
        secondColor="59, 130, 246"
        thirdColor="6, 182, 212"
        fourthColor="168, 85, 247"
        fifthColor="245, 158, 11"
        interactive={true}
        size="80%"
      />
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        onLogout={handleLogout}
        user={currentUser}
      />
      <main className="main-content">
        <Header
          title={sectionTitles[activeSection] ?? activeSection}
          user={currentUser}
        />
        <div className="dashboard-content">
          <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--color-text-tertiary)' }}>Loading...</div>}>
          {activeSection === 'dashboard' && <Dashboard />}
          {activeSection === 'gis-database' && <GISDatabase />}
          {activeSection === 'protected-areas' && <ProtectedAreas />}
          {activeSection === 'prodoc-tracker' && <ProDocTracker />}
          {activeSection === 'activity-planner' && <ActivityPlanner />}
          </Suspense>
        </div>
      </main>
    </div>
  )
}

export default App
