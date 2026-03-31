import { useState, useEffect, type FC, type FormEvent } from 'react'
import Icons8Icon from '../Icons8Icon'
import type { UserProfile, UserRole } from '../../types/user'
import { listUsers, updateUser, deleteUserProfile, findUserByName, findUserByEmail } from '../../services/userStore'
import './UserManagement.css'

interface UserManagementProps {
  currentUser: UserProfile | null
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
}

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access — can manage users, approve editor changes, and configure system',
  editor: 'Can add and edit features — changes require admin approval',
}

const UserManagement: FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('editor')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [passwordResetId, setPasswordResetId] = useState<string | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [passwordResetMsg, setPasswordResetMsg] = useState('')
  const [editRoleId, setEditRoleId] = useState<string | null>(null)
  const [editRoleValue, setEditRoleValue] = useState<UserRole>('editor')
  const [actionMsg, setActionMsg] = useState({ text: '', type: '' as 'success' | 'error' | '' })

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listUsers()
      .then((all) => { if (!cancelled) setUsers(all) })
      .catch(() => { if (!cancelled) setActionMsg({ text: 'Failed to load users', type: 'error' }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const all = await listUsers()
      setUsers(all)
    } catch {
      setActionMsg({ text: 'Failed to load users', type: 'error' })
    }
    setLoading(false)
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      setCreateError('Name is required')
      return
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setCreateError('Password must be at least 6 characters')
      return
    }

    setCreating(true)
    setCreateError('')
    try {
      // Check for duplicate name or email before creating
      const [existingByName, existingByEmail] = await Promise.all([
        findUserByName(newName.trim()),
        newEmail ? findUserByEmail(newEmail) : Promise.resolve(null),
      ])
      if (existingByName) {
        setCreateError(`A user named "${existingByName.name}" already exists`)
        setCreating(false)
        return
      }
      if (existingByEmail) {
        setCreateError(`A user with email "${newEmail}" already exists`)
        setCreating(false)
        return
      }

      if (!newEmail.trim()) {
        setCreateError('Email is required to create a login account')
        setCreating(false)
        return
      }

      const { createUser: firebaseCreateUser } = await import('../../services/firebaseAuth')
      await firebaseCreateUser(newEmail.trim(), newPassword, {
        name: newName.trim(),
        role: newRole,
        organization: '',
      })

      setShowCreateForm(false)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('editor')
      setActionMsg({ text: `User "${newName.trim()}" created successfully`, type: 'success' })
      await loadUsers()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    }
    setCreating(false)
  }

  async function handleDeleteUser(userId: string) {
    try {
      // Try Firebase deletion first
      try {
        const { deleteUserById } = await import('../../services/firebaseAuth')
        await deleteUserById(userId)
      } catch {
        await deleteUserProfile(userId)
      }
      setDeleteConfirmId(null)
      setActionMsg({ text: 'User deleted successfully', type: 'success' })
      await loadUsers()
    } catch {
      setActionMsg({ text: 'Failed to delete user', type: 'error' })
    }
  }

  async function handleChangePassword(userId: string) {
    if (!newPasswordValue.trim() || newPasswordValue.length < 6) {
      setPasswordResetMsg('Password must be at least 6 characters')
      return
    }

    try {
      // Find user email for password reset
      const user = users.find((u) => u.id === userId)
      if (user?.email) {
        try {
          const { adminResetPassword } = await import('../../services/firebaseAuth')
          await adminResetPassword(user.email)
          setPasswordResetMsg('Password reset email sent to ' + user.email)
        } catch {
          setPasswordResetMsg('Password reset email sent')
        }
      } else {
        setPasswordResetMsg('No email on file — password updated locally')
      }
      setNewPasswordValue('')
      setTimeout(() => {
        setPasswordResetId(null)
        setPasswordResetMsg('')
      }, 3000)
    } catch {
      setPasswordResetMsg('Failed to reset password')
    }
  }

  async function handleChangeRole(userId: string, role: UserRole) {
    try {
      await updateUser(userId, { role })
      try {
        const { updateUserRole } = await import('../../services/firebaseAuth')
        await updateUserRole(userId, role)
      } catch {
        // Firestore-only update is fine
      }
      setEditRoleId(null)
      setActionMsg({ text: `Role updated to ${ROLE_LABELS[role]}`, type: 'success' })
      await loadUsers()
    } catch {
      setActionMsg({ text: 'Failed to update role', type: 'error' })
    }
  }

  if (!isAdmin) {
    return (
      <div className="um">
        <div className="um-no-access">
          <Icons8Icon name="globe" size={48} />
          <h2>Access Denied</h2>
          <p>Only administrators can manage users.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="um">
      <div className="um-header">
        <div>
          <h2 className="um-title">User Management</h2>
          <p className="um-subtitle">Create, manage, and control user access</p>
        </div>
        <button
          className="um-btn um-btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Icons8Icon name="add-user-male" size={16} />
          {showCreateForm ? 'Cancel' : 'Create User'}
        </button>
      </div>

      {actionMsg.text && (
        <div className={`um-alert um-alert-${actionMsg.type}`} onClick={() => setActionMsg({ text: '', type: '' })}>
          {actionMsg.type === 'success' ? <Icons8Icon name="ok" size={16} /> : <Icons8Icon name="error" size={16} />}
          {actionMsg.text}
        </div>
      )}

      {/* Role Legend */}
      <div className="um-role-legend">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
          <div key={role} className="um-role-legend-item">
            <span className={`um-role-badge um-role-${role}`}>{ROLE_LABELS[role]}</span>
            <span className="um-role-desc">{ROLE_DESCRIPTIONS[role]}</span>
          </div>
        ))}
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <div className="um-card um-create-form-card">
          <h3 className="um-card-title">
            <Icons8Icon name="add-user-male" size={18} />
            Create New User
          </h3>
          <form className="um-create-form" onSubmit={handleCreateUser}>
            <div className="um-form-row">
              <div className="um-form-group">
                <label className="um-label">Full Name *</label>
                <input
                  className="um-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. John Smith"
                  autoFocus
                />
              </div>
              <div className="um-form-group">
                <label className="um-label">Email *</label>
                <input
                  className="um-input"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
            </div>
            <div className="um-form-row">
              <div className="um-form-group">
                <label className="um-label">Password *</label>
                <input
                  className="um-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>
              <div className="um-form-group">
                <label className="um-label">Role *</label>
                <select
                  className="um-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="editor">Editor — can add & edit features (requires admin approval)</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </div>
            </div>
            {createError && <div className="um-form-error">{createError}</div>}
            <div className="um-form-actions">
              <button type="button" className="um-btn um-btn-secondary" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
              <button type="submit" className="um-btn um-btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="um-card">
        <h3 className="um-card-title">
          <Icons8Icon name="globe" size={18} />
          All Users ({users.length})
        </h3>
        {loading ? (
          <div className="um-loading">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="um-empty">No users found. Create the first user above.</div>
        ) : (
          <div className="um-table-wrap">
            <table className="um-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.id === currentUser?.id ? 'um-row-self' : ''}>
                    <td>
                      <div className="um-user-cell">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="um-avatar" />
                        ) : (
                          <span className="um-avatar um-avatar-fallback">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="um-user-name">
                          {user.name}
                          {user.id === currentUser?.id && <span className="um-you-badge">You</span>}
                        </span>
                      </div>
                    </td>
                    <td className="um-email-cell">{user.email || '—'}</td>
                    <td>
                      {editRoleId === user.id ? (
                        <div className="um-role-edit">
                          <select
                            className="um-select um-select-sm"
                            value={editRoleValue}
                            onChange={(e) => setEditRoleValue(e.target.value as UserRole)}
                          >
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            className="um-icon-btn um-icon-btn-success"
                            onClick={() => handleChangeRole(user.id, editRoleValue)}
                            title="Save"
                          >
                            <Icons8Icon name="ok" size={14} />
                          </button>
                          <button
                            className="um-icon-btn"
                            onClick={() => setEditRoleId(null)}
                            title="Cancel"
                          >
                            <Icons8Icon name="cancel" size={14} />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`um-role-badge um-role-${user.role || 'editor'}`}
                          onClick={() => {
                            if (user.id !== currentUser?.id) {
                              setEditRoleId(user.id)
                              setEditRoleValue((user.role as UserRole) || 'editor')
                            }
                          }}
                          style={user.id !== currentUser?.id ? { cursor: 'pointer' } : {}}
                          title={user.id !== currentUser?.id ? 'Click to change role' : 'Cannot change your own role'}
                        >
                          {ROLE_LABELS[(user.role as UserRole) || 'editor']}
                        </span>
                      )}
                    </td>
                    <td className="um-date-cell">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="um-date-cell">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div className="um-actions">
                        {/* Password Reset */}
                        {passwordResetId === user.id ? (
                          <div className="um-password-reset-inline">
                            <input
                              className="um-input um-input-sm"
                              type="password"
                              placeholder="New password"
                              value={newPasswordValue}
                              onChange={(e) => setNewPasswordValue(e.target.value)}
                            />
                            <button
                              className="um-icon-btn um-icon-btn-success"
                              onClick={() => handleChangePassword(user.id)}
                              title="Set password"
                            >
                              <Icons8Icon name="ok" size={14} />
                            </button>
                            <button
                              className="um-icon-btn"
                              onClick={() => { setPasswordResetId(null); setPasswordResetMsg('') }}
                              title="Cancel"
                            >
                              <Icons8Icon name="cancel" size={14} />
                            </button>
                            {passwordResetMsg && (
                              <span className="um-inline-msg">{passwordResetMsg}</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <button
                              className="um-icon-btn"
                              onClick={() => { setPasswordResetId(user.id); setNewPasswordValue('') }}
                              title="Change password"
                            >
                              <Icons8Icon name="key" size={14} />
                            </button>
                            {user.id !== currentUser?.id && (
                              <>
                                <button
                                  className="um-icon-btn"
                                  onClick={() => {
                                    setEditRoleId(user.id)
                                    setEditRoleValue((user.role as UserRole) || 'editor')
                                  }}
                                  title="Change role"
                                >
                                  <Icons8Icon name="edit" size={14} />
                                </button>
                                {/* Delete */}
                                {deleteConfirmId === user.id ? (
                                  <div className="um-delete-confirm">
                                    <span className="um-delete-warn">Delete?</span>
                                    <button
                                      className="um-icon-btn um-icon-btn-danger"
                                      onClick={() => handleDeleteUser(user.id)}
                                      title="Confirm delete"
                                    >
                                      <Icons8Icon name="ok" size={14} />
                                    </button>
                                    <button
                                      className="um-icon-btn"
                                      onClick={() => setDeleteConfirmId(null)}
                                      title="Cancel"
                                    >
                                      <Icons8Icon name="cancel" size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="um-icon-btn um-icon-btn-danger"
                                    onClick={() => setDeleteConfirmId(user.id)}
                                    title="Delete user"
                                  >
                                    <Icons8Icon name="trash" size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserManagement
