import { useState, useRef, type FC, type ChangeEvent, type FormEvent } from 'react'
import Icons8Icon from '../Icons8Icon'
import { updateUser } from '../../services/userStore'
import type { UserProfile } from '../../types/user'
import './Account.css'

interface AccountProps {
  currentUser?: UserProfile | null
  onUserUpdated?: (user: UserProfile) => void
}

const MAX_AVATAR_SIZE = 512 * 1024 // 512 KB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const Account: FC<AccountProps> = ({ currentUser, onUserUpdated }) => {
  const [name, setName] = useState(currentUser?.name ?? '')
  const [email, setEmail] = useState(currentUser?.email ?? '')
  const [phone, setPhone] = useState(currentUser?.phone ?? '')
  const [position, setPosition] = useState(currentUser?.position ?? '')
  const [avatar, setAvatar] = useState<string | null>(currentUser?.avatar ?? null)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!currentUser) {
    return (
      <div className="data-portal">
        <div className="acc-no-access">
          <Icons8Icon name="user" size={48} />
          <h2>Account Settings</h2>
          <p>Please log in to manage your account.</p>
        </div>
      </div>
    )
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAlert({ type: 'error', message: 'Please select an image file.' })
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAlert({ type: 'error', message: 'Image must be under 512 KB.' })
      return
    }
    try {
      const base64 = await fileToBase64(file)
      setAvatar(base64)
      setAlert(null)
    } catch {
      setAlert({ type: 'error', message: 'Failed to read image file.' })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setAlert({ type: 'error', message: 'Name is required.' })
      return
    }
    setSaving(true)
    setAlert(null)
    try {
      const updated = await updateUser(currentUser.id, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        position: position.trim() || undefined,
        avatar,
      })
      if (updated) {
        onUserUpdated?.(updated)
        setAlert({ type: 'success', message: 'Profile updated successfully.' })
      } else {
        setAlert({ type: 'error', message: 'User not found.' })
      }
    } catch {
      setAlert({ type: 'error', message: 'Failed to save profile. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="data-portal">
      <div className="acc">
        <div className="acc-header">
          <h1 className="acc-title">Account Settings</h1>
          <p className="acc-subtitle">Manage your profile information</p>
        </div>

        {alert && (
          <div
            className={`acc-alert acc-alert-${alert.type}`}
            onClick={() => setAlert(null)}
          >
            {alert.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="acc-form">
          {/* Avatar section */}
          <div className="acc-card acc-avatar-card">
            <div className="acc-avatar-section">
              <button
                type="button"
                className="acc-avatar-btn"
                onClick={handleAvatarClick}
                title="Change profile picture"
              >
                {avatar ? (
                  <img src={avatar} alt={name} className="acc-avatar-img" />
                ) : (
                  <span className="acc-avatar-fallback">
                    {name.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <span className="acc-avatar-overlay">
                  <Icons8Icon name="camera" size={20} />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
              <div className="acc-avatar-info">
                <span className="acc-avatar-label">Profile Picture</span>
                <span className="acc-avatar-hint">Click to upload (max 512 KB)</span>
              </div>
            </div>
          </div>

          {/* Profile fields */}
          <div className="acc-card">
            <h2 className="acc-card-title">
              <Icons8Icon name="user" size={16} />
              Personal Information
            </h2>

            <div className="acc-form-grid">
              <div className="acc-form-group">
                <label className="acc-label" htmlFor="acc-name">
                  <Icons8Icon name="user" size={14} />
                  Full Name *
                </label>
                <input
                  id="acc-name"
                  className="acc-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="acc-form-group">
                <label className="acc-label" htmlFor="acc-position">
                  <Icons8Icon name="briefcase" size={14} />
                  Position
                </label>
                <input
                  id="acc-position"
                  className="acc-input"
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. GIS Officer"
                />
              </div>

              <div className="acc-form-group">
                <label className="acc-label" htmlFor="acc-email">
                  <Icons8Icon name="mail" size={14} />
                  Email Address
                </label>
                <input
                  id="acc-email"
                  className="acc-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="acc-form-group">
                <label className="acc-label" htmlFor="acc-phone">
                  <Icons8Icon name="phone" size={14} />
                  Phone Number
                </label>
                <input
                  id="acc-phone"
                  className="acc-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+678 12345"
                />
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="acc-form-actions">
            <button
              type="submit"
              className="acc-btn acc-btn-primary"
              disabled={saving}
            >
              <Icons8Icon name="save" size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Account
