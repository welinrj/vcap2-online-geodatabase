import type { FC } from 'react'
import type { UserProfile } from '../types/user'
import {
  LayoutDashboard,
  Database,
  ShieldCheck,
  FileBarChart2,
  CalendarDays,
  LogOut,
  LogIn,
  Users,
  FolderOpen,
  CalendarCheck,
  MessageSquare,
  UserCog,
  BarChart3,
} from 'lucide-react'
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
    icon: <LayoutDashboard className="nav-icon" size={18} />,
  },
  {
    id: 'prodoc-tracker',
    label: 'ProDoc Tracker',
    icon: <FileBarChart2 className="nav-icon" size={18} />,
  },
  {
    id: 'merl-dashboard',
    label: 'MERL Dashboard',
    icon: <BarChart3 className="nav-icon" size={18} />,
  },
]

/** Items visible only to authenticated users (admin + editor) */
const authNavItems = [
  {
    id: 'gis-database',
    label: 'GIS Database',
    icon: <Database className="nav-icon" size={18} />,
  },
  {
    id: 'protected-areas',
    label: 'CCAs & MPAs',
    icon: <ShieldCheck className="nav-icon" size={18} />,
  },
  {
    id: 'activity-planner',
    label: 'Activity Planner',
    icon: <CalendarDays className="nav-icon" size={18} />,
  },
  {
    id: 'file-manager',
    label: 'File Manager',
    icon: <FolderOpen className="nav-icon" size={18} />,
  },
  {
    id: 'activity-calendar',
    label: 'Activity Calendar',
    icon: <CalendarCheck className="nav-icon" size={18} />,
  },
  {
    id: 'messaging',
    label: 'Messages',
    icon: <MessageSquare className="nav-icon" size={18} />,
  },
]

const adminNavItems = [
  {
    id: 'user-management',
    label: 'User Management',
    icon: <Users className="nav-icon" size={18} />,
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
                {item.icon}
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
                    {item.icon}
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
                    {item.icon}
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
                <UserCog className="nav-icon" size={18} />
                Account
              </button>
              <button className="nav-item logout-btn" onClick={onLogout}>
                <LogOut className="nav-icon" size={18} />
                Log Out
              </button>
            </>
          ) : (
            <button className="nav-item login-btn" onClick={onLogin}>
              <LogIn className="nav-icon" size={18} />
              Staff Login
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
