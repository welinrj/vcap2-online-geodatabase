import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StaffLogin from './components/StaffLogin'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BackgroundGradientAnimation } from './components/ui/background-gradient-animation'
import { PortalLoader } from './components/ui/customizable-loader-spinner-transition'
import ChatPopup from './components/ChatPopup'
import { getUser } from './services/userStore'
import { onIncomingCalls } from './services/callService'
import { ProDocProvider } from './contexts/ProDocContext'
import { auth } from './config/firebase'
import { signInAnonymously } from 'firebase/auth'
import type { UserProfile } from './types/user'
import type { CallSignal } from './types/messaging'
import './App.css'

const Dashboard = lazy(() => import('./components/portal/Dashboard'))
const GISDatabase = lazy(() => import('./components/portal/GISDatabase'))
const ProtectedAreas = lazy(() => import('./components/portal/ProtectedAreas'))
const ProDocTracker = lazy(() => import('./components/portal/ProDocTracker'))
const ActivityPlanner = lazy(() => import('./components/portal/ActivityPlanner'))
const UserManagement = lazy(() => import('./components/portal/UserManagement'))
const FileManager = lazy(() => import('./components/portal/FileManager'))
const ActivityCalendar = lazy(() => import('./components/portal/ActivityCalendar'))
const Messaging = lazy(() => import('./components/portal/Messaging'))
const VideoCall = lazy(() => import('./components/portal/VideoCall'))
const Account = lazy(() => import('./components/portal/Account'))
const FisheriesDashboard = lazy(() => import('./components/portal/FisheriesDashboard'))
const MEDashboard = lazy(() => import('./components/portal/MEDashboard'))
const QuarterlyLog = lazy(() => import('./components/portal/QuarterlyLog'))
const RiskRegister = lazy(() => import('./components/portal/RiskRegister'))
const sectionTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  'gis-database': 'GIS Database',
  'protected-areas': 'CCAs & MPAs',
  'prodoc-tracker': 'ProDoc Tracker',
  'activity-planner': 'Activity Planner',
  'user-management': 'User Management',
  'file-manager': 'File Manager',
  'activity-calendar': 'Activity Calendar',
  messaging: 'Messages',
  account: 'Account Settings',
  'fisheries-dashboard': 'Fisheries Dashboard',
  'me-dashboard': 'M&E Dashboard',
  'quarterly-log': 'Quarterly Progress Log',
  'risk-register': 'Risk Register',
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

  // Call state
  const [outgoingCall, setOutgoingCall] = useState<{
    calleeId: string; calleeName: string; type: 'video' | 'audio'
  } | null>(null)
  const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null)

  useEffect(() => {
    const userId = sessionStorage.getItem('vcap2_user_id')
    if (staffAuth && userId) {
      // Ensure Firebase Auth session exists for Storage/Firestore rules
      if (!auth.currentUser) {
        signInAnonymously(auth).catch(() => { /* non-fatal */ })
      }
      const restoreFromSession = () => {
        const stored = sessionStorage.getItem('vcap2_user_profile')
        if (stored) {
          try { setCurrentUser(JSON.parse(stored)) } catch { /* ignore */ }
        }
      }
      getUser(userId)
        .then((user) => {
          if (user) setCurrentUser(user)
          else restoreFromSession()
        })
        .catch(restoreFromSession)
    }
  }, [staffAuth])

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUser) return
    return onIncomingCalls(currentUser.id, (calls) => {
      // Show the first incoming call if not already in a call
      if (calls.length > 0 && !outgoingCall && !incomingCall) {
        setIncomingCall(calls[0])
      }
    })
  }, [currentUser, outgoingCall, incomingCall])

  const handleLogout = () => {
    sessionStorage.removeItem('vcap2_staff_auth')
    sessionStorage.removeItem('vcap2_user_id')
    sessionStorage.removeItem('vcap2_user_profile')
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

  const handleStartCall = useCallback((calleeId: string, calleeName: string, type: 'video' | 'audio') => {
    setOutgoingCall({ calleeId, calleeName, type })
  }, [])

  const handleNavigateToChat = useCallback(() => {
    setActiveSection('messaging')
  }, [])

  // Show login modal when requested (either from sidebar button or restricted nav)
  if (showLogin && !staffAuth) {
    return (
      <StaffLogin
        onSuccess={(user) => {
          setStaffAuth(true)
          setCurrentUser(user)
          setShowLogin(false)
          // Bridge custom portal auth to Firebase Auth so Storage/Firestore rules pass
          if (!auth.currentUser) {
            signInAnonymously(auth).catch(() => { /* non-fatal */ })
          }
        }}
        onCancel={() => {
          setShowLogin(false)
        }}
      />
    )
  }

  const isAuthenticated = staffAuth && currentUser !== null

  return (
    <ProDocProvider>
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
          onNavigateToChat={handleNavigateToChat}
        />
        <div className="dashboard-content">
          <ErrorBoundary>
          <Suspense fallback={<PortalLoader squareCount={10} speed={0.5} />}>
          {activeSection === 'dashboard' && <Dashboard />}
          {activeSection === 'gis-database' && isAuthenticated && <GISDatabase currentUser={currentUser} />}
          {activeSection === 'protected-areas' && isAuthenticated && <ProtectedAreas />}
          {activeSection === 'prodoc-tracker' && <ProDocTracker readOnly={!isAuthenticated} />}
          {activeSection === 'activity-planner' && isAuthenticated && <ActivityPlanner currentUser={currentUser} />}
          {activeSection === 'user-management' && isAuthenticated && <UserManagement currentUser={currentUser} />}
          {activeSection === 'file-manager' && isAuthenticated && <FileManager currentUser={currentUser} />}
          {activeSection === 'activity-calendar' && isAuthenticated && <ActivityCalendar currentUser={currentUser} />}
          {activeSection === 'fisheries-dashboard' && isAuthenticated && <FisheriesDashboard currentUser={currentUser} />}
          {activeSection === 'me-dashboard' && isAuthenticated && <MEDashboard />}
          {activeSection === 'quarterly-log' && isAuthenticated && <QuarterlyLog currentUser={currentUser} />}
          {activeSection === 'risk-register' && isAuthenticated && <RiskRegister currentUser={currentUser} />}
          {activeSection === 'messaging' && isAuthenticated && (
            <Messaging currentUser={currentUser} onStartCall={handleStartCall} />
          )}
          {activeSection === 'account' && isAuthenticated && (
            <Account currentUser={currentUser} onUserUpdated={setCurrentUser} />
          )}
          </Suspense>
          </ErrorBoundary>

          {/* Video/Audio Call Overlay */}
          {(outgoingCall || incomingCall) && currentUser && (
            <Suspense fallback={null}>
              <VideoCall
                currentUser={currentUser}
                outgoingCall={outgoingCall}
                incomingCall={incomingCall}
                onClose={() => {
                  setOutgoingCall(null)
                  setIncomingCall(null)
                }}
              />
            </Suspense>
          )}
        </div>
      </main>

      {/* Floating Chat Popup — available on all pages when authenticated */}
      {isAuthenticated && currentUser && (
        <ChatPopup currentUser={currentUser} onStartCall={handleStartCall} />
      )}
    </div>
    </ProDocProvider>
  )
}

export default App
