import type { FC } from 'react'
import type { UserProfile } from '../types/user'
import {
  LayoutDashboard,
  Database,
  ShieldCheck,
  FileBarChart2,
  CalendarDays,
  LogOut,
} from 'lucide-react'
import vcap2Logo from '../../assets/vcap2-logo.png'
import coatOfArms from '../../assets/vanuatu-coat-of-arms.png'

interface SidebarProps {
  activeSection: string
  onNavigate: (section: string) => void
  onLogout: () => void
  user: UserProfile | null
}

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="nav-icon" size={18} />,
  },
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
    id: 'prodoc-tracker',
    label: 'ProDoc Tracker',
    icon: <FileBarChart2 className="nav-icon" size={18} />,
  },
  {
    id: 'activity-planner',
    label: 'Activity Planner',
    icon: <CalendarDays className="nav-icon" size={18} />,
  },
]

const Sidebar: FC<SidebarProps> = ({ activeSection, onNavigate, onLogout, user }) => {
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

      <span className="sidebar-section-label">Management</span>

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
            <LogOut className="nav-icon" size={18} />
            Log Out
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
