import { useState, useEffect, type FC, type FormEvent } from 'react'
import type { ProtectedAreaSummary } from '../../types/protectedArea'
import type { UserProfile } from '../../types/user'
import { listProtectedAreas } from '../../services/protectedAreaStore'
import { listUsers } from '../../services/userStore'
import {
  listAllActivities,
  saveActivity,
  deleteActivity as deleteActivityStore,
  ACTIVITY_TYPES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type Activity,
  type ActivityType,
  type ActivityStatus,
  type ActivityPriority,
} from '../../services/activityStore'
import './DataPortal.css'
import './ActivityPlanner.css'

interface ActivityPlannerProps {
  currentUser?: UserProfile | null
}

const ActivityPlanner: FC<ActivityPlannerProps> = ({ currentUser }) => {
  const [activities, setActivities] = useState<Activity[]>([])
  const [areas, setAreas] = useState<ProtectedAreaSummary[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')

  useEffect(() => {
    listProtectedAreas().then(setAreas).catch(() => {})
    listAllActivities().then(setActivities).catch(() => {})
    listUsers().then(setAllUsers).catch(() => {})
  }, [])

  async function addActivity(a: Omit<Activity, 'id' | 'createdAt'>) {
    const newActivity: Activity = {
      ...a,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const next = [...activities, newActivity]
    setActivities(next)
    await saveActivity(newActivity)
  }

  async function updateStatus(id: string, status: ActivityStatus) {
    const next = activities.map((a) => (a.id === id ? { ...a, status } : a))
    setActivities(next)
    const updated = next.find((a) => a.id === id)
    if (updated) await saveActivity(updated)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this activity?')) return
    const next = activities.filter((a) => a.id !== id)
    setActivities(next)
    await deleteActivityStore(id)
  }

  const filtered = activities.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false
    if (filterType && a.type !== filterType) return false
    return true
  }).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  const planned = activities.filter((a) => a.status === 'planned').length
  const inProgress = activities.filter((a) => a.status === 'in-progress').length
  const completed = activities.filter((a) => a.status === 'completed').length

  return (
    <div className="data-portal">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>Activity Planner</h2>
          <span className="dataset-count">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div className="portal-toolbar-right">
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Plan Activity'}
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="ap-stats">
        <div className="ap-stat">
          <span className="ap-stat-count ap-count-amber">{planned}</span>
          <span className="ap-stat-label">Planned</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-count ap-count-blue">{inProgress}</span>
          <span className="ap-stat-label">In Progress</span>
        </div>
        <div className="ap-stat">
          <span className="ap-stat-count ap-count-green">{completed}</span>
          <span className="ap-stat-label">Completed</span>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <ActivityForm
          areas={areas}
          users={allUsers}
          currentUser={currentUser ?? null}
          onSave={(a) => { addActivity(a); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filters */}
      {activities.length > 0 && (
        <div className="pa-filters">
          <div className="pa-filter-group">
            <label htmlFor="ap-filter-status">Status</label>
            <select id="ap-filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="pa-filter-group">
            <label htmlFor="ap-filter-type">Type</label>
            <select id="ap-filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All</option>
              {Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <span className="pa-filter-count">{filtered.length} of {activities.length}</span>
        </div>
      )}

      {/* Activity list */}
      {filtered.length === 0 && !showForm ? (
        <div className="portal-empty">
          <p>{activities.length === 0 ? 'No activities planned yet.' : 'No activities match the current filters.'}</p>
          {activities.length === 0 && (
            <>
              <p style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
                Plan field surveys, boundary mapping, community consultations, and more for your CCAs and MPAs.
              </p>
              <button className="btn btn-primary ap-empty-cta" onClick={() => setShowForm(true)}>
                + Plan Your First Activity
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="ap-list">
          {filtered.map((a) => (
            <div key={a.id} className={`ap-card ap-card-${a.priority}`}>
              <div className="ap-card-header">
                <div className="ap-card-badges">
                  <span className={`badge badge-${a.status === 'in-progress' ? 'active' : a.status === 'completed' ? 'active' : a.status === 'planned' ? 'draft' : 'archived'}`}>
                    {STATUS_LABELS[a.status]}
                  </span>
                  <span className="badge badge-format">{ACTIVITY_TYPES[a.type]}</span>
                  <span className={`ap-priority ap-priority-${a.priority}`}>{PRIORITY_LABELS[a.priority]}</span>
                </div>
                <div className="action-buttons">
                  <select
                    className="ap-status-select"
                    value={a.status}
                    onChange={(e) => updateStatus(a.id, e.target.value as ActivityStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>Delete</button>
                </div>
              </div>
              <h4 className="ap-card-title">{a.title}</h4>
              {a.description && <p className="ap-card-desc">{a.description}</p>}
              <div className="ap-card-meta">
                <span className="ap-card-area">{a.areaName || 'General'}</span>
                {a.assignedToName && <span>Assigned to: {a.assignedToName}</span>}
                {a.startDate && <span>{a.startDate}{a.endDate ? ` — ${a.endDate}` : ''}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Activity Form ──────────────────────────────────

interface ActivityFormProps {
  areas: ProtectedAreaSummary[]
  users: UserProfile[]
  currentUser: UserProfile | null
  onSave: (a: Omit<Activity, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

const ActivityForm: FC<ActivityFormProps> = ({ areas, users, currentUser, onSave, onCancel }) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [areaId, setAreaId] = useState('')
  const [type, setType] = useState<ActivityType>('survey')
  const [status, setStatus] = useState<ActivityStatus>('planned')
  const [priority, setPriority] = useState<ActivityPriority>('medium')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id ?? '')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    const area = areas.find((a) => a.id === areaId)
    const assignee = users.find((u) => u.id === assignedTo)
    onSave({
      title: title.trim(),
      description: description.trim(),
      areaId,
      areaName: area?.name ?? '',
      type,
      status,
      priority,
      startDate,
      endDate,
      createdBy: currentUser?.id ?? '',
      createdByName: currentUser?.name ?? '',
      assignedTo: assignedTo || currentUser?.id || '',
      assignedToName: assignee?.name ?? currentUser?.name ?? '',
    })
  }

  return (
    <div className="upload-panel" style={{ maxWidth: 600, marginBottom: '1.5rem' }}>
      <h3>Plan New Activity</h3>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ap-title">Title *</label>
          <input id="ap-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Boundary mapping survey for Nguna MPA" required />
        </div>
        <div className="form-group">
          <label htmlFor="ap-desc">Description</label>
          <textarea id="ap-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description of the activity" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ap-area">Protected Area</label>
            <select id="ap-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">General (no specific area)</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type.toUpperCase()})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ap-type">Activity Type</label>
            <select id="ap-type" value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
              {Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ap-priority">Priority</label>
            <select id="ap-priority" value={priority} onChange={(e) => setPriority(e.target.value as ActivityPriority)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ap-status">Status</label>
            <select id="ap-status" value={status} onChange={(e) => setStatus(e.target.value as ActivityStatus)}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ap-start">Start Date</label>
            <input id="ap-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="ap-end">End Date</label>
            <input id="ap-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="ap-assigned">Assign To</label>
          <select id="ap-assigned" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Select user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}{u.id === currentUser?.id ? ' (Me)' : ''} {u.role ? `— ${u.role}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create Activity</button>
        </div>
      </form>
    </div>
  )
}

export default ActivityPlanner
