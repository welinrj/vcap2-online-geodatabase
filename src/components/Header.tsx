import type { FC } from 'react'
import type { UserProfile } from '../types/user'

interface HeaderProps {
  title: string
  user: UserProfile | null
}

const Header: FC<HeaderProps> = ({ title, user }) => {
  return (
    <header className="header">
      <h1>{title}</h1>
      {user && (
        <div className="header-user">
          <span className="header-greeting">Welcome, {user.name}</span>
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="header-avatar" />
          ) : (
            <span className="header-avatar header-avatar-fallback">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      )}
    </header>
  )
}

export default Header
