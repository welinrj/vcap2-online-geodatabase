import type { FC } from 'react'
import type { UserProfile } from '../types/user'
import { LogIn } from 'lucide-react'
import NotificationPanel from './portal/NotificationPanel'
import coatOfArms from '../../assets/vanuatu-coat-of-arms.png'

interface HeaderProps {
  title: string
  user: UserProfile | null
  isAuthenticated: boolean
  onLogin: () => void
  onNavigateToChat?: (conversationId: string) => void
}

const Header: FC<HeaderProps> = ({ title, user, isAuthenticated, onLogin, onNavigateToChat }) => {
  return (
    <header className="header">
      <div className="header-left">
        <h1>{title}</h1>
        <span className="header-badge">DEPC</span>
      </div>
      <div className="header-user">
        {isAuthenticated && user && (
          <NotificationPanel currentUser={user} onNavigateToChat={onNavigateToChat} />
        )}
        {isAuthenticated && user ? (
          <>
            <span className="header-greeting">Welcome, {user.name}</span>
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="header-avatar" />
            ) : (
              <span className="header-avatar header-avatar-fallback">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
          </>
        ) : (
          <button className="header-login-btn" onClick={onLogin}>
            <LogIn size={16} />
            Staff Login
          </button>
        )}
        <img src={coatOfArms} alt="Vanuatu" style={{ width: 28, height: 28, objectFit: 'contain', opacity: 0.6 }} />
      </div>
    </header>
  )
}

export default Header
