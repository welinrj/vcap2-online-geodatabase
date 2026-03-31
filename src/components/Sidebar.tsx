import type { FC } from 'react'
import type { UserProfile } from '../types/user'
import Icons8Icon from './Icons8Icon'
import vcap2Logo from '../../assets/vcap2-logo.png'
import coatOfArms from '../../assets/vanuatu-coat-of-arms.png'

interface SidebarProps {
  activeSection: string
  onNavigate: (section: string) => void
  onLogout: () => void
  onLogin: () => void
  user: UserProfile | null
  isAuthenticated: boolean
}

/** Items visible to everyone (public + authenticated) */
const publicNavItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
  },
  {
    id: 'prodoc-tracker',
    label: 'ProDoc Tracker',
    icon: 'statistics',
  },
]

/** Items visible only to authenticated users (admin + editor) */
const authNavItems = [
  {
    id: 'gis-database',
    label: 'GIS Database',
    icon: 'database',
  },
  {
    id: 'protected-areas',
    label: 'CCAs & MPAs',
    icon: 'globe',
  },
  {
    id: 'fisheries-dashboard',
    label: 'Fisheries Dashboard',
    icon: 'fish',
  },
  {
    id: 'me-dashboard',
    label: 'M&E Dashboard',
    icon: 'activity',
  },
  {
    id: 'activity-planner',
    label: 'Activity Planner',
    icon: 'calendar',
  },
  {
    id: 'quarterly-log',
    label: 'Quarterly Log',
    icon: 'statistics',
  },
  {
    id: 'risk-register',
    label: 'Risk Register',
    icon: 'error',
  },
  {
    id: 'file-manager',
    label: 'File Manager',
    icon: 'opened-folder',
  },
  {
    id: 'activity-calendar',
    label: 'Activity Calendar',
    icon: 'event-accepted',
  },
  {
    id: 'messaging',
    label: 'Messages',
    icon: 'chat',
  },
  {
    id: 'google-integration',
    label: 'Google',
    icon: 'google-logo',
  },
]

const adminNavItems = [
  {
    id: 'user-management',
    label: 'User Management',
    icon: 'group',
    adminOnly: true,
  },
]

const Sidebar: FC<SidebarProps> = ({ activeSection, onNavigate, onLogout, onLogin, user, isAuthenticated }) => {
  return (
    <aside className="sidebar">
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

      <span className="sidebar-section-label">Public</span>

      <nav className="sidebar-nav">
        <ul>
          {publicNavItems.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={item.label}
              >
                <Icons8Icon name={item.icon} size={18} className="nav-icon" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {isAuthenticated && (
        <>
          <span className="sidebar-section-label">Management</span>
          <nav className="sidebar-nav">
            <ul>
              {authNavItems.map((item) => (
                <li key={item.id}>
                  <button
                    className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                    title={item.label}
                  >
                    <Icons8Icon name={item.icon} size={18} className="nav-icon" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {user?.role === 'admin' && (
        <>
          <span className="sidebar-section-label">Administration</span>
          <nav className="sidebar-nav">
            <ul>
              {adminNavItems.map((item) => (
                <li key={item.id}>
                  <button
                    className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                    title={item.label}
                  >
                    <Icons8Icon name={item.icon} size={18} className="nav-icon" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-user-section">
          {isAuthenticated && user ? (
            <>
              <div className="sidebar-user-info">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="sidebar-avatar" />
                ) : (
                  <span className="sidebar-avatar sidebar-avatar-fallback">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="sidebar-user-details">
                  <span className="sidebar-user-name">{user.name}</span>
                  {user.role && (
                    <span className={`sidebar-role-badge sidebar-role-${user.role}`}>
                      {user.role === 'admin' ? 'Admin' : 'Editor'}
                    </span>
                  )}
                </div>
              </div>
              <button
                className={`nav-item ${activeSection === 'account' ? 'active' : ''}`}
                onClick={() => onNavigate('account')}
                title="Account Settings"
              >
                <Icons8Icon name="gear" size={18} className="nav-icon" />
                Account
              </button>
              <button className="nav-item logout-btn" onClick={onLogout}>
                <Icons8Icon name="logout-rounded" size={18} className="nav-icon" />
                Log Out
              </button>
            </>
          ) : (
            <button className="nav-item login-btn" onClick={onLogin}>
              <Icons8Icon name="enter" size={18} className="nav-icon" />
              Staff Login
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
