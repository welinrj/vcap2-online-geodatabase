import type { FC } from 'react'
import type { UserProfile } from '../types/user'
import vcap2Logo from '../../assets/vcap2-logo.png'
import coatOfArms from '../../assets/vanuatu-coat-of-arms.png'

interface SidebarProps {
  activePage: 'staff' | 'public'
  activeSection: string
  onPageChange: (page: 'staff' | 'public') => void
  onNavigate: (section: string) => void
  staffAuth: boolean
  onLogout: () => void
  user: UserProfile | null
}

const staffNavItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'gis-database',
    label: 'GIS Database',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
      </svg>
    ),
  },
  {
    id: 'protected-areas',
    label: 'CCAs & MPAs',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: 'activity-planner',
    label: 'Activity Planner',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" />
        <path d="M8 18h.01" /><path d="M12 18h.01" />
      </svg>
    ),
  },
]

const publicNavItems = [
  {
    id: 'datasets',
    label: 'Datasets',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
]

const Sidebar: FC<SidebarProps> = ({ activePage, activeSection, onPageChange, onNavigate, staffAuth, onLogout, user }) => {
  const navItems = activePage === 'staff' ? staffNavItems : publicNavItems

  return (
    <aside className={`sidebar${activePage === 'public' ? ' public-sidebar' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logos">
          <img src={vcap2Logo} alt="VCAP2" className="sidebar-logo" />
          <img src={coatOfArms} alt="Vanuatu" className="sidebar-coat-of-arms" />
        </div>
        <div className="sidebar-brand-text">
          <h2>VCAP2</h2>
          <span className="sidebar-brand-subtitle">Centralised Data Portal</span>
        </div>
      </div>

      <div className="page-switcher">
        <button
          className={`page-switcher-btn${activePage === 'staff' ? ' active' : ''}`}
          onClick={() => onPageChange('staff')}
        >
          Staff
        </button>
        <button
          className={`page-switcher-btn${activePage === 'public' ? ' active' : ''}`}
          onClick={() => onPageChange('public')}
        >
          Public
        </button>
      </div>

      <span className="sidebar-section-label">
        {activePage === 'staff' ? 'Management' : 'Public Access'}
      </span>

      <nav className="sidebar-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={item.label}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        {activePage === 'public' && (
          <span className="public-badge">Read-Only Access</span>
        )}
        {activePage === 'staff' && staffAuth && (
          <div className="sidebar-user-section">
            {user && (
              <div className="sidebar-user-info">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="sidebar-avatar" />
                ) : (
                  <span className="sidebar-avatar sidebar-avatar-fallback">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="sidebar-user-name">{user.name}</span>
              </div>
            )}
            <button className="nav-item logout-btn" onClick={onLogout}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log Out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
