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
import Icons8Icon from '../Icons8Icon'
import './DataPortal.css'
import './ActivityPlanner.css'

interface ActivityPlannerProps {
  currentUser?: UserProfile | null
}

const VUV_RATE = 119.25 // default VUV per USD

function fmtVUV(v: number | null | undefined): string {
  if (v == null) return '—'
  return `VT ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function isOverdue(a: Activity): boolean {
  if (a.status === 'completed' || a.status === 'cancelled') return false
  const due = a.dueDate || a.endDate
  if (!due) return false
  return due < new Date().toISOString().slice(0, 10)
}

const PRODOC_INDICATORS = ['', '1.1', '1.2', '2.1', '2.2', 'CI5']

const ActivityPlanner: FC<ActivityPlannerProps> = ({ currentUser }) => {
  const [activities, setActivities] = useState<Activity[]>([])
  const [areas, setAreas] = useState<ProtectedAreaSummary[]>([])
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterIndicator, setFilterIndicator] = useState<string>('')
  const [filterMilestone, setFilterMilestone] = useState(false)

  useEffect(() => {
    listProtectedAreas().then(setAreas).catch(() => {})
    listAllActivities().then(setActivities).catch(() => {})
    listUsers().then(setAllUsers).catch(() => {})
  }, [])

  async function addActivity(a: Omit<Activity, 'id' | 'createdAt'>) {
    const newActivity: Activity = { ...a, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setActivities((prev) => [...prev, newActivity])
    await saveActivity(newActivity)
  }

  async function updateActivity(updated: Activity) {
    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    await saveActivity(updated)
  }

  async function updateStatus(id: string, status: ActivityStatus) {
    const updated = activities.find((a) => a.id === id)
    if (!updated) return
    const next = { ...updated, status }
    setActivities((prev) => prev.map((a) => (a.id === id ? next : a)))
    await saveActivity(next)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this activity?')) return
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await deleteActivityStore(id)
  }

  const filtered = activities.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false
    if (filterType && a.type !== filterType) return false
    if (filterIndicator && a.prodocIndicator !== filterIndicator) return false
    if (filterMilestone && !a.isMilestone) return false
    return true
  }).sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 }
    return o[a.priority] - o[b.priority]
  })

  // Stats
  const planned   = activities.filter((a) => a.status === 'planned').length
  const inProgress = activities.filter((a) => a.status === 'in-progress').length
  const completed  = activities.filter((a) => a.status === 'completed').length
  const overdue    = activities.filter(isOverdue).length
  const milestones = activities.filter((a) => a.isMilestone).length

  // Budget summary
  const totalBudget = activities.reduce((s, a) => s + (a.budgetVUV ?? 0), 0)
  const totalActual = activities.reduce((s, a) => s + (a.actualVUV ?? 0), 0)
  const budgetPct   = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0

  return (
    <div className="data-portal">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>Activity Planner</h2>
          <span className="dataset-count">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div className="portal-toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditingActivity(null); setShowForm(!showForm) }}>
            {showForm && !editingActivity ? 'Cancel' : '+ Plan Activity'}
          </button>
        </div>
      </div>

      {/* Stats */}
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
        {overdue > 0 && (
          <div className="ap-stat">
            <span className="ap-stat-count ap-count-red">{overdue}</span>
            <span className="ap-stat-label">Overdue</span>
          </div>
        )}
        {milestones > 0 && (
          <div className="ap-stat">
            <span className="ap-stat-count ap-count-purple">{milestones}</span>
            <span className="ap-stat-label">Milestones</span>
          </div>
        )}
      </div>

      {/* Budget summary bar */}
      {totalBudget > 0 && (
        <div className="ap-budget-bar">
          <div className="ap-budget-bar-header">
            <span className="ap-budget-label">
              <Icons8Icon name="money" size={14} /> Total Budget
            </span>
            <span className="ap-budget-figures">
              <strong>{fmtVUV(totalActual)}</strong> spent of <strong>{fmtVUV(totalBudget)}</strong>
              <span className={`ap-budget-pct ${budgetPct > 100 ? 'ap-budget-over' : budgetPct > 80 ? 'ap-budget-warn' : 'ap-budget-ok'}`}>
                {budgetPct.toFixed(1)}%
              </span>
            </span>
          </div>
          <div className="ap-budget-track">
            <div
              className={`ap-budget-fill ${budgetPct > 100 ? 'ap-budget-fill-over' : budgetPct > 80 ? 'ap-budget-fill-warn' : 'ap-budget-fill-ok'}`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <ActivityForm
          areas={areas}
          users={allUsers}
          currentUser={currentUser ?? null}
          initial={editingActivity}
          onSave={(a) => {
            if (editingActivity) {
              updateActivity({ ...editingActivity, ...a })
            } else {
              addActivity(a)
            }
            setShowForm(false)
            setEditingActivity(null)
          }}
          onCancel={() => { setShowForm(false); setEditingActivity(null) }}
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
              <option value="">All Types</option>
              {Object.entries(ACTIVITY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="pa-filter-group">
            <label htmlFor="ap-filter-ind">Indicator</label>
            <select id="ap-filter-ind" value={filterIndicator} onChange={(e) => setFilterIndicator(e.target.value)}>
              <option value="">All</option>
              {['1.1', '1.2', '2.1', '2.2', 'CI5'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <label className="pa-filter-check">
            <input type="checkbox" checked={filterMilestone} onChange={(e) => setFilterMilestone(e.target.checked)} />
            Milestones only
          </label>
          <span className="pa-filter-count">{filtered.length} of {activities.length}</span>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 && !showForm ? (
        <div className="portal-empty">
          <p>{activities.length === 0 ? 'No activities planned yet.' : 'No activities match the current filters.'}</p>
          {activities.length === 0 && (
            <>
              <p style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
                Plan field surveys, boundary mapping, consultations, and more for your CCAs and MPAs.
              </p>
              <button className="btn btn-primary ap-empty-cta" onClick={() => setShowForm(true)}>
                + Plan Your First Activity
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="ap-list">
          {filtered.map((a) => {
            const overdueFl = isOverdue(a)
            return (
              <div key={a.id} className={`ap-card ap-card-${a.priority}${overdueFl ? ' ap-card-overdue' : ''}${a.isMilestone ? ' ap-card-milestone' : ''}`}>
                <div className="ap-card-header">
                  <div className="ap-card-badges">
                    <span className={`badge badge-${a.status === 'completed' ? 'active' : a.status === 'in-progress' ? 'active' : a.status === 'planned' ? 'draft' : 'archived'}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                    <span className="badge badge-format">{ACTIVITY_TYPES[a.type]}</span>
                    <span className={`ap-priority ap-priority-${a.priority}`}>{PRIORITY_LABELS[a.priority]}</span>
                    {a.isMilestone && <span className="ap-milestone-badge"><Icons8Icon name="goal" size={12} /> Milestone</span>}
                    {a.prodocIndicator && <span className="ap-ind-badge">{a.prodocIndicator}</span>}
                    {overdueFl && <span className="ap-overdue-badge"><Icons8Icon name="error" size={12} /> Overdue</span>}
                  </div>
                  <div className="action-buttons">
                    <select
                      className="ap-status-select"
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value as ActivityStatus)}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn btn-sm" onClick={() => { setEditingActivity(a); setShowForm(true) }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)}>Delete</button>
                  </div>
                </div>
                <h4 className="ap-card-title">{a.title}</h4>
                {a.description && <p className="ap-card-desc">{a.description}</p>}
                <div className="ap-card-meta">
                  {a.areaName && <span className="ap-card-area">{a.areaName}</span>}
                  {a.assignedToName && <span><Icons8Icon name="user" size={12} /> {a.assignedToName}</span>}
                  {a.startDate && <span><Icons8Icon name="calendar" size={12} /> {a.startDate}{a.endDate ? ` — ${a.endDate}` : ''}</span>}
                  {a.dueDate && <span className={overdueFl ? 'ap-meta-overdue' : ''}><Icons8Icon name="clock" size={12} /> Due: {a.dueDate}</span>}
                </div>
                {(a.budgetVUV != null || a.actualVUV != null) && (
                  <div className="ap-card-budget">
                    <span>Budget: <strong>{fmtVUV(a.budgetVUV)}</strong></span>
                    <span>Actual: <strong>{fmtVUV(a.actualVUV)}</strong></span>
                    {a.budgetVUV != null && a.actualVUV != null && a.budgetVUV > 0 && (
                      <span className={a.actualVUV > a.budgetVUV ? 'ap-budget-over' : 'ap-budget-ok'}>
                        {((a.actualVUV / a.budgetVUV) * 100).toFixed(0)}% used
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
  initial: Activity | null
  onSave: (a: Omit<Activity, 'id' | 'createdAt'>) => void
  onCancel: () => void
}

const ActivityForm: FC<ActivityFormProps> = ({ areas, users, currentUser, initial, onSave, onCancel }) => {
  const [title, setTitle]               = useState(initial?.title ?? '')
  const [description, setDescription]   = useState(initial?.description ?? '')
  const [areaId, setAreaId]             = useState(initial?.areaId ?? '')
  const [type, setType]                 = useState<ActivityType>(initial?.type ?? 'survey')
  const [status, setStatus]             = useState<ActivityStatus>(initial?.status ?? 'planned')
  const [priority, setPriority]         = useState<ActivityPriority>(initial?.priority ?? 'medium')
  const [startDate, setStartDate]       = useState(initial?.startDate ?? '')
  const [endDate, setEndDate]           = useState(initial?.endDate ?? '')
  const [dueDate, setDueDate]           = useState(initial?.dueDate ?? '')
  const [isMilestone, setIsMilestone]   = useState(initial?.isMilestone ?? false)
  const [assignedTo, setAssignedTo]     = useState(initial?.assignedTo ?? currentUser?.id ?? '')
  const [prodocIndicator, setProdocIndicator] = useState(initial?.prodocIndicator ?? '')
  const [budgetVUV, setBudgetVUV]       = useState<string>(initial?.budgetVUV != null ? String(initial.budgetVUV) : '')
  const [actualVUV, setActualVUV]       = useState<string>(initial?.actualVUV != null ? String(initial.actualVUV) : '')
  const [error, setError]               = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    const area     = areas.find((a) => a.id === areaId)
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
      dueDate,
      isMilestone,
      createdBy: initial?.createdBy ?? currentUser?.id ?? '',
      createdByName: initial?.createdByName ?? currentUser?.name ?? '',
      assignedTo: assignedTo || currentUser?.id || '',
      assignedToName: assignee?.name ?? currentUser?.name ?? '',
      prodocIndicator,
      budgetVUV: budgetVUV !== '' ? Number(budgetVUV) : null,
      actualVUV: actualVUV !== '' ? Number(actualVUV) : null,
    })
  }

  return (
    <div className="upload-panel" style={{ maxWidth: 680, marginBottom: '1.5rem' }}>
      <h3>{initial ? 'Edit Activity' : 'Plan New Activity'}</h3>
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
          <div className="form-group">
            <label htmlFor="ap-ind">ProDoc Indicator</label>
            <select id="ap-ind" value={prodocIndicator} onChange={(e) => setProdocIndicator(e.target.value)}>
              {PRODOC_INDICATORS.map((k) => <option key={k} value={k}>{k || 'None'}</option>)}
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
          <div className="form-group">
            <label htmlFor="ap-due">Due Date</label>
            <input id="ap-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ap-budget">Budget (VUV)</label>
            <input id="ap-budget" type="number" min="0" value={budgetVUV} onChange={(e) => setBudgetVUV(e.target.value)} placeholder="e.g. 150000" />
          </div>
          <div className="form-group">
            <label htmlFor="ap-actual">Actual Spent (VUV)</label>
            <input id="ap-actual" type="number" min="0" value={actualVUV} onChange={(e) => setActualVUV(e.target.value)} placeholder="e.g. 120000" />
          </div>
        </div>
        <div className="form-row">
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
          <div className="form-group" style={{ justifyContent: 'flex-end', paddingTop: '1.5rem' }}>
            <label className="ap-milestone-check">
              <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} />
              Mark as Milestone
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? 'Save Changes' : 'Create Activity'}</button>
        </div>
      </form>
    </div>
  )
}

export default ActivityPlanner
