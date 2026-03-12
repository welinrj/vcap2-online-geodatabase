import type { FC } from 'react'
import type { UserProfile } from '../types/user'

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
  { id: 'gis-database', label: 'GIS Database' },
  { id: 'protected-areas', label: 'CCAs & MPAs' },
]

const publicNavItems = [
  { id: 'datasets', label: 'Datasets' },
  { id: 'about', label: 'About' },
]

const Sidebar: FC<SidebarProps> = ({ activePage, activeSection, onPageChange, onNavigate, staffAuth, onLogout, user }) => {
  const navItems = activePage === 'staff' ? staffNavItems : publicNavItems

  return (
    <aside className={`sidebar${activePage === 'public' ? ' public-sidebar' : ''}`}>
      <div className="sidebar-header">
        <h2>VCAP2</h2>
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
      </div>
      <nav className="sidebar-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={item.label}
              >
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
              Log Out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
