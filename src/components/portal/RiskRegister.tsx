import { useState, useEffect, type FC, type FormEvent } from 'react'
import type { UserProfile } from '../../types/user'
import {
  listRisks, saveRisk, deleteRisk,
  RISK_CATEGORIES, RISK_STATUS_LABELS, riskLevel,
  type Risk, type RiskCategory, type RiskStatus,
} from '../../services/riskStore'
import Icons8Icon from '../Icons8Icon'
import './DataPortal.css'
import './RiskRegister.css'

interface RiskRegisterProps {
  currentUser?: UserProfile | null
}

const LEVEL_ICON = { high: 'cancel', medium: 'error', low: 'approval' }
const LEVEL_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

const RiskRegister: FC<RiskRegisterProps> = ({ currentUser }) => {
  const [risks, setRisks] = useState<Risk[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterLevel, setFilterLevel] = useState<string>('')

  useEffect(() => { listRisks().then(setRisks).catch(() => {}) }, [])

  async function handleSave(r: Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const saved: Risk = editingRisk
      ? { ...editingRisk, ...r, updatedAt: now }
      : { ...r, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    setRisks((prev) => {
      const idx = prev.findIndex((x) => x.id === saved.id)
      const next = idx >= 0 ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved]
      return next.sort((a, b) => b.score - a.score)
    })
    await saveRisk(saved)
    setShowForm(false)
    setEditingRisk(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this risk?')) return
    setRisks((prev) => prev.filter((r) => r.id !== id))
    await deleteRisk(id)
  }

  const filtered = risks.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterLevel && riskLevel(r.score) !== filterLevel) return false
    return true
  })

  const highCount   = risks.filter((r) => riskLevel(r.score) === 'high').length
  const medCount    = risks.filter((r) => riskLevel(r.score) === 'medium').length
  const openCount   = risks.filter((r) => r.status === 'open').length
  const escalCount  = risks.filter((r) => r.status === 'escalated').length

  return (
    <div className="data-portal">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>Risk Register</h2>
          <span className="dataset-count">{risks.length} risk{risks.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="portal-toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditingRisk(null); setShowForm(!showForm) }}>
            {showForm && !editingRisk ? 'Cancel' : '+ Add Risk'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rr-stats">
        {highCount > 0 && <div className="rr-stat rr-stat-high"><span>{highCount}</span> High Risk</div>}
        {medCount > 0  && <div className="rr-stat rr-stat-medium"><span>{medCount}</span> Medium</div>}
        {openCount > 0 && <div className="rr-stat rr-stat-open"><span>{openCount}</span> Open</div>}
        {escalCount > 0 && <div className="rr-stat rr-stat-escalated"><span>{escalCount}</span> Escalated</div>}
      </div>

      {showForm && (
        <RiskForm
          initial={editingRisk}
          currentUser={currentUser ?? null}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingRisk(null) }}
        />
      )}

      {risks.length > 0 && (
        <div className="pa-filters">
          <div className="pa-filter-group">
            <label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="pa-filter-group">
            <label>Risk Level</label>
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
              <option value="">All</option>
              <option value="high">High (≥15)</option>
              <option value="medium">Medium (8–14)</option>
              <option value="low">Low (≤7)</option>
            </select>
          </div>
          <span className="pa-filter-count">{filtered.length} of {risks.length}</span>
        </div>
      )}

      {filtered.length === 0 && !showForm ? (
        <div className="portal-empty">
          <p>{risks.length === 0 ? 'No risks recorded yet.' : 'No risks match the current filters.'}</p>
          {risks.length === 0 && (
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowForm(true)}>+ Add First Risk</button>
          )}
        </div>
      ) : (
        <div className="rr-table-wrap">
          <table className="rr-table">
            <thead>
              <tr>
                <th>Risk</th>
                <th>Category</th>
                <th>Likelihood</th>
                <th>Impact</th>
                <th>Score</th>
                <th>Level</th>
                <th>Owner</th>
                <th>Mitigation</th>
                <th>Status</th>
                <th>Review Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const level = riskLevel(r.score)
                return (
                  <tr key={r.id} className={`rr-row rr-row-${level}`}>
                    <td>
                      <div className="rr-title">{r.title}</div>
                      {r.description && <div className="rr-desc">{r.description}</div>}
                    </td>
                    <td>{RISK_CATEGORIES[r.category]}</td>
                    <td className="rr-center">{r.likelihood}/5</td>
                    <td className="rr-center">{r.impact}/5</td>
                    <td className="rr-center"><span className={`rr-score rr-score-${level}`}>{r.score}</span></td>
                    <td>
                      <span className={`rr-level rr-level-${level}`}>
                        <Icons8Icon name={LEVEL_ICON[level]} size={12} />
                        {LEVEL_LABEL[level]}
                      </span>
                    </td>
                    <td>{r.owner || '—'}</td>
                    <td className="rr-mitigation">{r.mitigation || '—'}</td>
                    <td>
                      <span className={`rr-status rr-status-${r.status}`}>{RISK_STATUS_LABELS[r.status]}</span>
                    </td>
                    <td>{r.reviewDate || '—'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-sm" onClick={() => { setEditingRisk(r); setShowForm(true) }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Risk Form ──────────────────────────────────────

interface RiskFormProps {
  initial: Risk | null
  currentUser: UserProfile | null
  onSave: (r: Omit<Risk, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

const RiskForm: FC<RiskFormProps> = ({ initial, currentUser, onSave, onCancel }) => {
  const [title, setTitle]           = useState(initial?.title ?? '')
  const [description, setDesc]      = useState(initial?.description ?? '')
  const [category, setCategory]     = useState<RiskCategory>(initial?.category ?? 'operational')
  const [likelihood, setLikelihood] = useState(initial?.likelihood ?? 3)
  const [impact, setImpact]         = useState(initial?.impact ?? 3)
  const [mitigation, setMitigation] = useState(initial?.mitigation ?? '')
  const [owner, setOwner]           = useState(initial?.owner ?? currentUser?.name ?? '')
  const [status, setStatus]         = useState<RiskStatus>(initial?.status ?? 'open')
  const [reviewDate, setReview]     = useState(initial?.reviewDate ?? '')
  const [error, setError]           = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Risk title is required'); return }
    const score = likelihood * impact
    onSave({ title: title.trim(), description: description.trim(), category, likelihood, impact, score, mitigation: mitigation.trim(), owner: owner.trim(), status, reviewDate })
  }

  const score = likelihood * impact
  const level = riskLevel(score)

  return (
    <div className="upload-panel" style={{ maxWidth: 680, marginBottom: '1.5rem' }}>
      <h3>{initial ? 'Edit Risk' : 'Add New Risk'}</h3>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Risk Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Delayed community consultation" required />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Brief explanation of the risk..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as RiskCategory)}>
              {Object.entries(RISK_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as RiskStatus)}>
              {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Likelihood (1–5)</label>
            <input type="range" min={1} max={5} value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))} />
            <span className="rr-range-val">{likelihood}</span>
          </div>
          <div className="form-group">
            <label>Impact (1–5)</label>
            <input type="range" min={1} max={5} value={impact} onChange={(e) => setImpact(Number(e.target.value))} />
            <span className="rr-range-val">{impact}</span>
          </div>
          <div className="form-group rr-score-preview">
            <label>Risk Score</label>
            <span className={`rr-score rr-score-${level} rr-score-lg`}>{score}</span>
            <span className={`rr-level rr-level-${level}`}>{LEVEL_LABEL[level]}</span>
          </div>
        </div>
        <div className="form-group">
          <label>Mitigation Measure</label>
          <textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} rows={2} placeholder="How will this risk be reduced or managed?" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Risk Owner</label>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name or role responsible" />
          </div>
          <div className="form-group">
            <label>Review Date</label>
            <input type="date" value={reviewDate} onChange={(e) => setReview(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? 'Save Changes' : 'Add Risk'}</button>
        </div>
      </form>
    </div>
  )
}

export default RiskRegister
