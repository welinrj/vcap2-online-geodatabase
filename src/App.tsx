import { useState, useEffect, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StaffLogin from './components/StaffLogin'
import { getUser } from './services/userStore'
import type { UserProfile } from './types/user'
import './App.css'

const GISDatabase = lazy(() => import('./components/portal/GISDatabase'))
const ProtectedAreas = lazy(() => import('./components/portal/ProtectedAreas'))
const PublicDataPortal = lazy(() => import('./components/public/PublicDataPortal'))

const sectionTitles: Record<string, string> = {
  'gis-database': 'GIS Database',
  'protected-areas': 'CCAs & MPAs',
  datasets: 'Datasets',
  about: 'About',
}

function App() {
  const [activePage, setActivePage] = useState<'staff' | 'public'>('public')
  const [activeSection, setActiveSection] = useState('datasets')
  const [staffAuth, setStaffAuth] = useState(
    () => sessionStorage.getItem('vcap2_staff_auth') === '1'
  )
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)

  // Restore user profile from session on mount
  useEffect(() => {
    const userId = sessionStorage.getItem('vcap2_user_id')
    if (staffAuth && userId) {
      getUser(userId).then((user) => {
        if (user) setCurrentUser(user)
      })
    }
  }, [staffAuth])

  const handlePageChange = (page: 'staff' | 'public') => {
    if (page === 'staff' && !staffAuth) {
      setActivePage('staff')
      return
    }
    setActivePage(page)
    setActiveSection(page === 'staff' ? 'gis-database' : 'datasets')
  }

  const handleLogout = () => {
    sessionStorage.removeItem('vcap2_staff_auth')
    sessionStorage.removeItem('vcap2_user_id')
    setStaffAuth(false)
    setCurrentUser(null)
    setActivePage('public')
    setActiveSection('datasets')
  }

  // Show login form when staff page is selected but not authenticated
  if (activePage === 'staff' && !staffAuth) {
    return (
      <StaffLogin
        onSuccess={(user) => {
          setStaffAuth(true)
          setCurrentUser(user)
          setActiveSection('gis-database')
        }}
        onCancel={() => {
          setActivePage('public')
          setActiveSection('datasets')
        }}
      />
    )
  }

  return (
    <>
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        activeSection={activeSection}
        onPageChange={handlePageChange}
        onNavigate={setActiveSection}
        staffAuth={staffAuth}
        onLogout={handleLogout}
        user={currentUser}
      />
      <main className="main-content">
        <Header
          title={sectionTitles[activeSection] ?? activeSection}
          user={activePage === 'staff' ? currentUser : null}
        />
        <div className="dashboard-content">
          <Suspense fallback={<div style={{ padding: '2rem', color: '#6b7280' }}>Loading...</div>}>
          {/* Staff page sections */}
          {activeSection === 'gis-database' && (
            <GISDatabase />
          )}
          {activeSection === 'protected-areas' && <ProtectedAreas />}

          {/* Public page sections */}
          {activeSection === 'datasets' && <PublicDataPortal />}
          {activeSection === 'about' && (
            <div className="placeholder-section">
              <h3>VCAP2 Public Data Portal</h3>
              <p style={{ marginTop: '0.75rem' }}>
                This public portal provides read-only access to geospatial datasets
                published by the Vanuatu Climate Adaptation Project 2 (VCAP2) and the
                Department of Environmental Protection &amp; Conservation (DEPC).
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                Datasets are uploaded and managed by authorized staff via the Staff page.
                The public can view, explore, and download datasets shared here.
              </p>
            </div>
          )}
          </Suspense>
        </div>
      </main>
    </div>
    </>
  )
}

export default App
