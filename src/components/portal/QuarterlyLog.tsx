import { useState, useEffect, type FC, type FormEvent } from 'react'
import type { UserProfile } from '../../types/user'
import {
  listQuarterlyLogs,
  saveQuarterlyLog,
  deleteQuarterlyLog,
  quarterLabel,
  type QuarterlyLog,
} from '../../services/quarterlyLogStore'
import Icons8Icon from '../Icons8Icon'
import './DataPortal.css'
import './QuarterlyLog.css'

interface QuarterlyLogProps {
  currentUser?: UserProfile | null
}

const INDICATORS = ['1.1', '1.2', '2.1', '2.2', 'CI5']

const QuarterlyLogPage: FC<QuarterlyLogProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<QuarterlyLog[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingLog, setEditingLog] = useState<QuarterlyLog | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { listQuarterlyLogs().then(setLogs).catch(() => {}) }, [])

  async function handleSave(log: Omit<QuarterlyLog, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const saved: QuarterlyLog = editingLog
      ? { ...editingLog, ...log, updatedAt: now }
      : { ...log, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    setLogs((prev) => {
      const idx = prev.findIndex((l) => l.id === saved.id)
      return idx >= 0
        ? prev.map((l) => (l.id === saved.id ? saved : l))
        : [saved, ...prev]
    })
    await saveQuarterlyLog(saved)
    setShowForm(false)
    setEditingLog(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this quarterly log entry?')) return
    setLogs((prev) => prev.filter((l) => l.id !== id))
    await deleteQuarterlyLog(id)
  }

  return (
    <div className="data-portal">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>Quarterly Progress Log</h2>
          <span className="dataset-count">{logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div className="portal-toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditingLog(null); setShowForm(!showForm) }}>
            {showForm && !editingLog ? 'Cancel' : '+ New Entry'}
          </button>
        </div>
      </div>

      {showForm && (
        <LogForm
          initial={editingLog}
          currentUser={currentUser ?? null}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingLog(null) }}
        />
      )}

      {logs.length === 0 && !showForm ? (
        <div className="portal-empty">
          <p>No quarterly progress entries yet.</p>
          <p style={{ fontSize: '0.82rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
            Record achievements, issues, and plans for each quarter to build a historical progress record for reporting.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Record First Quarter</button>
        </div>
      ) : (
        <div className="ql-list">
          {logs.map((log) => (
            <div key={log.id} className="ql-card">
              <div className="ql-card-header" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <div className="ql-card-meta">
                  <span className="ql-quarter-badge">
                    <Icons8Icon name="calendar" size={13} />
                    {quarterLabel(log.year, log.quarter)}
                  </span>
                  {log.indicators.length > 0 && (
                    <div className="ql-ind-tags">
                      {log.indicators.map((ind) => (
                        <span key={ind} className="ql-ind-tag">{ind}</span>
                      ))}
                    </div>
                  )}
                  {log.budgetSpentVUV != null && (
                    <span className="ql-budget-tag">
                      <Icons8Icon name="money" size={12} />
                      VT {log.budgetSpentVUV.toLocaleString()} spent
                    </span>
                  )}
                </div>
                <div className="ql-card-actions">
                  <span className="ql-author">{log.authorName}</span>
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditingLog(log); setShowForm(true) }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(log.id) }}>Delete</button>
                  <Icons8Icon name={expanded === log.id ? 'collapse-arrow' : 'expand-arrow'} size={14} />
                </div>
              </div>

              {log.summary && <p className="ql-summary">{log.summary}</p>}

              {expanded === log.id && (
                <div className="ql-body">
                  {log.achievements && (
                    <div className="ql-section">
                      <div className="ql-section-title"><Icons8Icon name="approval" size={13} /> Achievements</div>
                      <p>{log.achievements}</p>
                    </div>
                  )}
                  {log.issues && (
                    <div className="ql-section">
                      <div className="ql-section-title ql-title-warn"><Icons8Icon name="error" size={13} /> Issues &amp; Challenges</div>
                      <p>{log.issues}</p>
                    </div>
                  )}
                  {log.nextSteps && (
                    <div className="ql-section">
                      <div className="ql-section-title ql-title-blue"><Icons8Icon name="idea" size={13} /> Next Steps</div>
                      <p>{log.nextSteps}</p>
                    </div>
                  )}
                  <div className="ql-footer">
                    Updated: {new Date(log.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Log Form ──────────────────────────────────────

interface LogFormProps {
  initial: QuarterlyLog | null
  currentUser: UserProfile | null
  onSave: (log: Omit<QuarterlyLog, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}

const LogForm: FC<LogFormProps> = ({ initial, currentUser, onSave, onCancel }) => {
  const currentYear = new Date().getFullYear()
  const currentQ    = Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4

  const [year, setYear]           = useState(initial?.year ?? currentYear)
  const [quarter, setQuarter]     = useState<1|2|3|4>(initial?.quarter ?? currentQ)
  const [summary, setSummary]     = useState(initial?.summary ?? '')
  const [achievements, setAch]    = useState(initial?.achievements ?? '')
  const [issues, setIssues]       = useState(initial?.issues ?? '')
  const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? '')
  const [selInds, setSelInds]     = useState<string[]>(initial?.indicators ?? [])
  const [budgetSpent, setBudget]  = useState<string>(initial?.budgetSpentVUV != null ? String(initial.budgetSpentVUV) : '')
  const [error, setError]         = useState('')

  function toggleInd(ind: string) {
    setSelInds((prev) => prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind])
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!summary.trim()) { setError('Summary is required'); return }
    onSave({
      year, quarter, summary: summary.trim(),
      achievements: achievements.trim(),
      issues: issues.trim(),
      nextSteps: nextSteps.trim(),
      indicators: selInds,
      budgetSpentVUV: budgetSpent !== '' ? Number(budgetSpent) : null,
      authorName: initial?.authorName ?? currentUser?.name ?? 'Unknown',
    })
  }

  return (
    <div className="upload-panel" style={{ maxWidth: 680, marginBottom: '1.5rem' }}>
      <h3>{initial ? 'Edit Quarterly Log' : 'New Quarterly Log Entry'}</h3>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Quarter</label>
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as 1|2|3|4)}>
              <option value={1}>Q1 — Jan to Mar</option>
              <option value={2}>Q2 — Apr to Jun</option>
              <option value={3}>Q3 — Jul to Sep</option>
              <option value={4}>Q4 — Oct to Dec</option>
            </select>
          </div>
          <div className="form-group">
            <label>Budget Spent (VUV)</label>
            <input type="number" min="0" value={budgetSpent} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 500000" />
          </div>
        </div>
        <div className="form-group">
          <label>Indicators Covered</label>
          <div className="ql-ind-selector">
            {INDICATORS.map((ind) => (
              <label key={ind} className={`ql-ind-option ${selInds.includes(ind) ? 'ql-ind-selected' : ''}`}>
                <input type="checkbox" checked={selInds.includes(ind)} onChange={() => toggleInd(ind)} />
                {ind}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Quarterly Summary *</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Brief overall summary of the quarter's progress..." required />
        </div>
        <div className="form-group">
          <label>Key Achievements</label>
          <textarea value={achievements} onChange={(e) => setAch(e.target.value)} rows={3} placeholder="What was successfully delivered this quarter?" />
        </div>
        <div className="form-group">
          <label>Issues &amp; Challenges</label>
          <textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={3} placeholder="What problems or blockers were encountered?" />
        </div>
        <div className="form-group">
          <label>Plans for Next Quarter</label>
          <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={3} placeholder="What activities and targets are planned for the next quarter?" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? 'Save Changes' : 'Save Entry'}</button>
        </div>
      </form>
    </div>
  )
}

export default QuarterlyLogPage
