// VCAP II Fisheries Dashboard
import { useState, useEffect, type FC } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { UserProfile } from '../../types/user'
import type {
  FisheriesActivity, ActivityProgress, FisheriesIndicator, IndicatorProgress,
  Quarter, ActivityStatus,
} from '../../types/fisheries'
import {
  seedFisheriesData,
  listActivities,
  listAllProgress,
  upsertProgress,
  listIndicators,
  listAllIndicatorProgress,
} from '../../services/fisheriesStore'
import './DataPortal.css'

interface FisheriesDashboardProps {
  currentUser?: UserProfile | null
}

const QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

const STATUS_COLORS: Record<ActivityStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  delayed: '#ef4444',
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  delayed: 'Delayed',
}

const DEFAULT_RATE = 119.25

const FisheriesDashboard: FC<FisheriesDashboardProps> = ({ currentUser }) => {
  const [activities, setActivities] = useState<FisheriesActivity[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ActivityProgress>>({})
  const [indicators, setIndicators] = useState<FisheriesIndicator[]>([])
  const [indProgressMap, setIndProgressMap] = useState<Record<string, IndicatorProgress[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'indicators'>('overview')
  const [exchangeRate, setExchangeRate] = useState(() => {
    const stored = localStorage.getItem('vcap2_vuv_rate')
    return stored ? Number(stored) : DEFAULT_RATE
  })

  function updateRate(rate: number) {
    const r = rate > 0 ? rate : DEFAULT_RATE
    setExchangeRate(r)
    localStorage.setItem('vcap2_vuv_rate', String(r))
  }

  function toVuv(usd: number): number {
    return Math.round(usd * exchangeRate)
  }

  function fmtVuv(usd: number): string {
    return `VT ${toVuv(usd).toLocaleString()}`
  }
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>('Q1')
  const [editingProgress, setEditingProgress] = useState<{
    activityId: string
    quarter: Quarter
  } | null>(null)
  const [editForm, setEditForm] = useState({
    status: 'not_started' as ActivityStatus,
    actualUsd: 0,
    percentDone: 0,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      await seedFisheriesData()
      const [acts, progList, inds, indProg] = await Promise.all([
        listActivities(),
        listAllProgress(),
        listIndicators(),
        listAllIndicatorProgress(),
      ])
      setActivities(acts)

      const pm: Record<string, ActivityProgress> = {}
      progList.forEach(p => { pm[`${p.activityId}_${p.quarter}`] = p })
      setProgressMap(pm)

      setIndicators(inds)
      const ipm: Record<string, IndicatorProgress[]> = {}
      inds.forEach(ind => { ipm[ind.id] = [] })
      indProg.forEach(ip => {
        if (!ipm[ip.indicatorId]) ipm[ip.indicatorId] = []
        ipm[ip.indicatorId].push(ip)
      })
      setIndProgressMap(ipm)

      setLoading(false)
    }
    load().catch(err => {
      console.error('FisheriesDashboard load error:', err)
      setLoading(false)
    })
  }, [])

  function getProgress(activityId: string, quarter: Quarter): ActivityProgress | undefined {
    return progressMap[`${activityId}_${quarter}`]
  }

  function openEdit(activityId: string, quarter: Quarter) {
    const existing = getProgress(activityId, quarter)
    setEditForm({
      status: existing?.status ?? 'not_started',
      actualUsd: existing?.actualUsd ?? 0,
      percentDone: existing?.percentDone ?? 0,
      notes: existing?.notes ?? '',
    })
    setSaveError(null)
    setEditingProgress({ activityId, quarter })
  }

  async function saveEdit() {
    if (!editingProgress || !currentUser) return
    setSaving(true)
    setSaveError(null)
    try {
      const { activityId, quarter } = editingProgress
      const updated = await upsertProgress(activityId, quarter, {
        ...editForm,
        updatedBy: currentUser.id,
      })
      setProgressMap(prev => ({
        ...prev,
        [`${activityId}_${quarter}`]: updated,
      }))
      setEditingProgress(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setSaveError(msg.includes('permission') || msg.includes('PERMISSION')
        ? 'Permission denied. Please log out and log back in.'
        : `Failed to save: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Overview stats ──────────────────────────────────────────────────────────
  const totalBudget = activities.reduce((s, a) => s + a.budgetUsd, 0)
  const totalActual = Object.values(progressMap).reduce((s, p) => s + p.actualUsd, 0)
  const statusCounts = Object.values(progressMap).reduce<Record<ActivityStatus, number>>(
    (acc, p) => { acc[p.status] = (acc[p.status] ?? 0) + 1; return acc },
    { not_started: 0, in_progress: 0, completed: 0, delayed: 0 }
  )

  const quarterBudgetData = QUARTERS.map(q => {
    const budgeted = activities.reduce((s, a) => {
      const key = q === 'Q1' ? 'q1Budget' : q === 'Q2' ? 'q2Budget' : q === 'Q3' ? 'q3Budget' : 'q4Budget'
      return s + a[key]
    }, 0)
    const actual = activities.reduce((s, a) => {
      const p = getProgress(a.id, q)
      return s + (p?.actualUsd ?? 0)
    }, 0)
    return { quarter: q, budgeted, actual }
  })

  if (loading) {
    return (
      <div className="data-portal">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Loading Fisheries Dashboard…
        </div>
      </div>
    )
  }

  return (
    <div className="data-portal">
      <div className="portal-toolbar" style={{ flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
          VCAP II Fisheries Dashboard
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '0.3rem 0.6rem',
            fontSize: '0.8rem', color: '#15803d',
          }}>
            <span style={{ fontWeight: 600 }}>1 USD =</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={exchangeRate}
              onChange={e => updateRate(Number(e.target.value))}
              style={{
                width: 70, padding: '0.2rem 0.35rem', borderRadius: 4,
                border: '1px solid #86efac', fontSize: '0.8rem', fontWeight: 600,
                textAlign: 'right', background: '#fff', color: '#15803d',
              }}
            />
            <span style={{ fontWeight: 600 }}>VUV</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['overview', 'activities', 'indicators'] as const).map(tab => (
              <button
                key={tab}
                className={`btn ${activeTab === tab ? 'btn-primary' : ''}`}
                style={activeTab !== tab ? { background: 'transparent', border: '1px solid #e2e8f0' } : undefined}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── OVERVIEW TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Total Budget', value: `$${totalBudget.toLocaleString()}`, sub: fmtVuv(totalBudget) },
              { label: 'Total Spent', value: `$${totalActual.toLocaleString()}`, sub: fmtVuv(totalActual) },
              { label: 'Budget Used', value: totalBudget ? `${((totalActual / totalBudget) * 100).toFixed(1)}%` : '0%' },
              { label: 'Activities', value: activities.length },
              { label: 'Completed', value: statusCounts.completed },
              { label: 'Delayed', value: statusCounts.delayed },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
              }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{kpi.label}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{kpi.value}</span>
                {kpi.sub && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>{kpi.sub}</span>}
              </div>
            ))}
          </div>

          {/* Budget vs Actual chart */}
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600 }}>Budget vs Actual by Quarter</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={quarterBudgetData} barCategoryGap="30%">
                <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()} (${fmtVuv(Number(v))})`} />
                <Bar dataKey="budgeted" name="Budgeted" fill="#bfdbfe" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Status breakdown */}
          <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 600 }}>Activity Status</h3>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {(Object.keys(STATUS_LABELS) as ActivityStatus[]).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: STATUS_COLORS[s], display: 'inline-block' }} />
                  <span style={{ fontSize: '0.85rem' }}>{STATUS_LABELS[s]}: <strong>{statusCounts[s]}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVITIES TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'activities' && (
        <div style={{ padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Quarter:</span>
            {QUARTERS.map(q => (
              <button
                key={q}
                className={`btn ${selectedQuarter === q ? 'btn-primary' : ''}`}
                style={selectedQuarter !== q ? { background: 'transparent', border: '1px solid #e2e8f0' } : undefined}
                onClick={() => setSelectedQuarter(q)}
              >
                {q}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Code', 'Description', 'Output', 'Fund', 'Budget (USD / VUV)', `${selectedQuarter} Budget`, 'Status', 'Actual (USD / VUV)', '% Done', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map((act, i) => {
                  const prog = getProgress(act.id, selectedQuarter)
                  const qBudget = selectedQuarter === 'Q1' ? act.q1Budget
                    : selectedQuarter === 'Q2' ? act.q2Budget
                    : selectedQuarter === 'Q3' ? act.q3Budget
                    : act.q4Budget
                  return (
                    <tr key={act.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{act.code}</td>
                      <td style={{ padding: '0.5rem 0.75rem', maxWidth: 280 }}>{act.description}</td>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{act.output}</td>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{act.fund}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        ${act.budgetUsd.toLocaleString()}
                        <br /><span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtVuv(act.budgetUsd)}</span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        ${qBudget.toLocaleString()}
                        <br /><span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtVuv(qBudget)}</span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {prog ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            fontSize: '0.75rem', fontWeight: 500,
                            background: STATUS_COLORS[prog.status] + '22',
                            color: STATUS_COLORS[prog.status],
                          }}>
                            {STATUS_LABELS[prog.status]}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {prog ? (
                          <>
                            ${prog.actualUsd.toLocaleString()}
                            <br /><span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtVuv(prog.actualUsd)}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                        {prog ? `${prog.percentDone}%` : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {currentUser && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                            onClick={() => openEdit(act.id, selectedQuarter)}
                          >
                            {prog ? 'Edit' : 'Update'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INDICATORS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'indicators' && (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {indicators.map(ind => {
            const progs = indProgressMap[ind.id] ?? []
            const latest = progs.slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
            const pct = ind.targetValue > 0 ? Math.min(100, ((latest?.value ?? ind.baselineValue) / ind.targetValue) * 100) : 0
            return (
              <div key={ind.id} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 4 }}>{ind.code}</span>
                    <p style={{ margin: '0.4rem 0 0', fontWeight: 600, color: '#1e293b' }}>{ind.name}</p>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {latest?.value ?? ind.baselineValue} / {ind.targetValue} {ind.unit}
                  </span>
                </div>
                <div style={{ background: '#f1f5f9', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: '#3b82f6', borderRadius: 999 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>Baseline: {ind.baselineValue} {ind.unit}</span>
                  <span>{pct.toFixed(1)}% of target</span>
                </div>
              </div>
            )
          })}
          {indicators.length === 0 && (
            <p style={{ color: '#64748b', textAlign: 'center' }}>No indicators loaded.</p>
          )}
        </div>
      )}

      {/* ── EDIT MODAL ──────────────────────────────────────────────────────── */}
      {editingProgress && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '1.5rem', minWidth: 360,
            maxWidth: 480, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600 }}>
              Update Progress — {editingProgress.quarter}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                Status
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value as ActivityStatus }))}
                  style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid #e2e8f0' }}
                >
                  {(Object.keys(STATUS_LABELS) as ActivityStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                Actual Spend (USD)
                <input
                  type="number" min={0}
                  value={editForm.actualUsd}
                  onChange={e => setEditForm(f => ({ ...f, actualUsd: Number(e.target.value) }))}
                  style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                % Complete
                <input
                  type="number" min={0} max={100}
                  value={editForm.percentDone}
                  onChange={e => setEditForm(f => ({ ...f, percentDone: Number(e.target.value) }))}
                  style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                Notes
                <textarea
                  rows={3}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid #e2e8f0', resize: 'vertical' }}
                />
              </label>
            </div>
            {saveError && (
              <div style={{
                marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 6,
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                fontSize: '0.82rem',
              }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                style={{ background: 'transparent', border: '1px solid #e2e8f0' }}
                onClick={() => { setEditingProgress(null); setSaveError(null) }}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FisheriesDashboard
