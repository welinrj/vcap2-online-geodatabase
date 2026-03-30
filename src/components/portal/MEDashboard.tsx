import { useMemo, useState, useEffect, type FC } from 'react'
import { useProDoc } from '../../contexts/useProDoc'
import { computeIndicatorTracking, enforceAuthoritativeValues, enforceAuthoritativeExistingValues } from '../../services/prodocAnalytics'
import { generateRecommendations, type Recommendation } from '../../services/recommendationsEngine'
import { listAllActivities, type Activity } from '../../services/activityStore'
import { exportProgressReport } from '../../services/reportExport'
import Icons8Icon from '../Icons8Icon'
import { INDICATOR_COLORS } from '../../constants/indicatorColors'
import './MEDashboard.css'

// Traffic-light thresholds
function trafficLight(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 75) return 'green'
  if (pct >= 40) return 'amber'
  return 'red'
}

const LIGHT_ICON: Record<string, string> = { green: 'approval', amber: 'error', red: 'cancel' }
const LIGHT_LABEL: Record<string, string> = { green: 'On Track', amber: 'At Risk', red: 'Off Track' }

function fmtVUV(v: number): string {
  if (v >= 1_000_000) return `VT ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `VT ${(v / 1_000).toFixed(0)}K`
  return `VT ${v.toLocaleString()}`
}

const SEV_ICON: Record<string, string> = { critical: 'cancel', warning: 'error', info: 'info' }
const SEV_LABEL: Record<string, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' }

const MEDashboard: FC = () => {
  const { newAreas, existingAreas } = useProDoc()
  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    listAllActivities().then(setActivities).catch(() => {})
  }, [])

  const tracking = useMemo(() => computeIndicatorTracking(newAreas, existingAreas), [newAreas, existingAreas])
  const { recommendations, generatedAt } = useMemo(
    () => generateRecommendations(newAreas, existingAreas, activities),
    [newAreas, existingAreas, activities],
  )

  // Activity summary
  const today = new Date().toISOString().slice(0, 10)
  const totalActivities  = activities.length
  const completedAct     = activities.filter((a) => a.status === 'completed').length
  const inProgressAct    = activities.filter((a) => a.status === 'in-progress').length
  const overdueAct       = activities.filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled' && (a.dueDate || a.endDate) && (a.dueDate || a.endDate) < today,
  ).length

  // Budget summary
  const totalBudget = activities.reduce((s, a) => s + (a.budgetVUV ?? 0), 0)
  const totalActual = activities.reduce((s, a) => s + (a.actualVUV ?? 0), 0)
  const budgetPct   = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0

  // Registration summary
  const correctedNew      = newAreas.map(enforceAuthoritativeValues)
  const correctedExisting = existingAreas.map(enforceAuthoritativeExistingValues)
  const allAreas          = [...correctedNew, ...correctedExisting]
  const totalAreasCount   = allAreas.length
  const registeredCount   = allAreas.filter((a) => a.registrationStatus === 'Registered').length
  const mappedCount       = allAreas.filter((a) => a.mappingStatus === 'Completed').length

  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length
  const warnCount     = recommendations.filter((r) => r.severity === 'warning').length

  return (
    <div className="me-dashboard">
      <div className="portal-toolbar">
        <div className="portal-toolbar-left">
          <h2>M&amp;E Dashboard</h2>
          <span className="dataset-count">
            Monitoring &amp; Evaluation — {criticalCount > 0 ? `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}` : 'Overview'}
          </span>
        </div>
        <div className="portal-toolbar-right">
          <span className="me-generated">Updated: {new Date(generatedAt).toLocaleString()}</span>
          <button
            className="btn btn-primary"
            onClick={() => exportProgressReport(newAreas, existingAreas, activities)}
          >
            <Icons8Icon name="export" size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* ── Summary KPI Strip ───────────────────────────────── */}
      <div className="me-kpi-strip">
        <div className="me-kpi">
          <Icons8Icon name="map" size={20} className="me-kpi-icon" />
          <div>
            <div className="me-kpi-value">{totalAreasCount}</div>
            <div className="me-kpi-label">Total Areas</div>
          </div>
        </div>
        <div className="me-kpi">
          <Icons8Icon name="approval" size={20} className="me-kpi-icon me-kpi-green" />
          <div>
            <div className="me-kpi-value me-kpi-green">{registeredCount}</div>
            <div className="me-kpi-label">Registered</div>
          </div>
        </div>
        <div className="me-kpi">
          <Icons8Icon name="map-pin" size={20} className="me-kpi-icon me-kpi-blue" />
          <div>
            <div className="me-kpi-value me-kpi-blue">{mappedCount}</div>
            <div className="me-kpi-label">Mapped</div>
          </div>
        </div>
        <div className="me-kpi">
          <Icons8Icon name="calendar" size={20} className="me-kpi-icon me-kpi-amber" />
          <div>
            <div className="me-kpi-value">{completedAct}/{totalActivities}</div>
            <div className="me-kpi-label">Activities Done</div>
          </div>
        </div>
        {overdueAct > 0 && (
          <div className="me-kpi">
            <Icons8Icon name="error" size={20} className="me-kpi-icon me-kpi-red" />
            <div>
              <div className="me-kpi-value me-kpi-red">{overdueAct}</div>
              <div className="me-kpi-label">Overdue</div>
            </div>
          </div>
        )}
        {totalBudget > 0 && (
          <div className="me-kpi">
            <Icons8Icon name="money" size={20} className="me-kpi-icon me-kpi-teal" />
            <div>
              <div className="me-kpi-value me-kpi-teal">{budgetPct.toFixed(0)}%</div>
              <div className="me-kpi-label">Budget Used</div>
            </div>
          </div>
        )}
      </div>

      {/* ── ProDoc Indicator Traffic Lights ─────────────────── */}
      <section className="me-section">
        <h3 className="me-section-title">
          <Icons8Icon name="activity" size={16} />
          ProDoc Indicator Status
        </h3>
        <div className="me-traffic-grid">
          {tracking.map((ind) => {
            const light = trafficLight(ind.progressPct)
            const color = INDICATOR_COLORS[ind.key] ?? '#64748b'
            return (
              <div key={ind.key} className={`me-traffic-card me-traffic-${light}`}>
                <div className="me-traffic-header">
                  <span className="me-traffic-key" style={{ color }}>{ind.key}</span>
                  <span className={`me-traffic-light me-light-${light}`}>
                    <Icons8Icon name={LIGHT_ICON[light]} size={14} />
                    {LIGHT_LABEL[light]}
                  </span>
                </div>
                <div className="me-traffic-label">{ind.label}</div>
                <div className="me-traffic-pct" style={{ color }}>
                  {ind.progressPct >= 100 ? '>100' : ind.progressPct.toFixed(1)}%
                </div>
                <div className="me-traffic-bar-track">
                  <div className="me-traffic-bar-fill" style={{ width: `${Math.min(ind.progressPct, 100)}%`, background: color }} />
                </div>
                <div className="me-traffic-stats">
                  <span>{ind.mappedHa.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {ind.targetHa.toLocaleString()} ha</span>
                  <span>{ind.registered}/{ind.totalAreas} registered</span>
                  <span>{ind.mappingCompleted}/{ind.totalAreas} mapped</span>
                </div>
                {ind.issues.length > 0 && (
                  <ul className="me-traffic-issues">
                    {ind.issues.slice(0, 2).map((iss, i) => (
                      <li key={i} className={`me-issue-${iss.severity}`}>
                        <Icons8Icon name={iss.severity === 'high' ? 'cancel' : 'error'} size={11} />
                        {iss.issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Activity & Budget Summary ────────────────────────── */}
      <div className="me-two-col">
        <section className="me-section">
          <h3 className="me-section-title">
            <Icons8Icon name="calendar" size={16} />
            Activity Summary
          </h3>
          <div className="me-summary-list">
            {[
              { label: 'Completed', value: completedAct, color: 'green' },
              { label: 'In Progress', value: inProgressAct, color: 'blue' },
              { label: 'Planned', value: activities.filter((a) => a.status === 'planned').length, color: 'amber' },
              { label: 'Cancelled', value: activities.filter((a) => a.status === 'cancelled').length, color: 'grey' },
              { label: 'Overdue', value: overdueAct, color: 'red' },
            ].map(({ label, value, color }) => value > 0 ? (
              <div key={label} className="me-summary-row">
                <span className="me-summary-label">{label}</span>
                <div className="me-summary-bar-track">
                  <div
                    className={`me-summary-bar-fill me-bar-${color}`}
                    style={{ width: totalActivities > 0 ? `${(value / totalActivities) * 100}%` : '0%' }}
                  />
                </div>
                <span className={`me-summary-count me-color-${color}`}>{value}</span>
              </div>
            ) : null)}
            {totalActivities === 0 && <p className="me-empty">No activities recorded yet.</p>}
          </div>
        </section>

        <section className="me-section">
          <h3 className="me-section-title">
            <Icons8Icon name="money" size={16} />
            Budget Overview (VUV)
          </h3>
          {totalBudget > 0 ? (
            <div className="me-budget-overview">
              <div className="me-budget-row">
                <span>Total Planned</span>
                <strong>{fmtVUV(totalBudget)}</strong>
              </div>
              <div className="me-budget-row">
                <span>Total Spent</span>
                <strong className={budgetPct > 100 ? 'me-color-red' : 'me-color-green'}>{fmtVUV(totalActual)}</strong>
              </div>
              <div className="me-budget-row">
                <span>Remaining</span>
                <strong className={totalBudget - totalActual < 0 ? 'me-color-red' : ''}>{fmtVUV(Math.abs(totalBudget - totalActual))}{totalBudget - totalActual < 0 ? ' over' : ''}</strong>
              </div>
              <div className="me-budget-track" style={{ marginTop: '0.75rem' }}>
                <div
                  className={`me-budget-fill ${budgetPct > 100 ? 'me-bar-red' : budgetPct > 80 ? 'me-bar-amber' : 'me-bar-green'}`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <div className="me-budget-pct-label">{budgetPct.toFixed(1)}% utilised</div>
            </div>
          ) : (
            <p className="me-empty">No budget data recorded. Add budget figures in the Activity Planner.</p>
          )}
        </section>
      </div>

      {/* ── Recommendations ──────────────────────────────────── */}
      <section className="me-section">
        <h3 className="me-section-title">
          <Icons8Icon name="idea" size={16} />
          Recommended Way Forward
          {recommendations.length > 0 && (
            <span className="me-rec-counts">
              {criticalCount > 0 && <span className="me-rec-badge me-rec-critical">{criticalCount} Critical</span>}
              {warnCount > 0 && <span className="me-rec-badge me-rec-warning">{warnCount} Warning</span>}
            </span>
          )}
        </h3>
        {recommendations.length === 0 ? (
          <div className="me-all-good">
            <Icons8Icon name="approval" size={32} />
            <p>No issues detected — all indicators and activities appear on track.</p>
          </div>
        ) : (
          <div className="me-rec-list">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const RecommendationCard: FC<{ rec: Recommendation }> = ({ rec }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`me-rec-card me-rec-sev-${rec.severity}`}>
      <div className="me-rec-header" onClick={() => setExpanded(!expanded)}>
        <div className="me-rec-left">
          <span className={`me-rec-icon me-rec-sev-icon-${rec.severity}`}>
            <Icons8Icon name={SEV_ICON[rec.severity]} size={15} />
          </span>
          <div>
            <div className="me-rec-title">{rec.title}</div>
            <div className="me-rec-cat">{SEV_LABEL[rec.severity]} · {rec.category}</div>
          </div>
        </div>
        <Icons8Icon name={expanded ? 'collapse-arrow' : 'expand-arrow'} size={14} className="me-rec-chevron" />
      </div>
      {expanded && (
        <div className="me-rec-body">
          <p className="me-rec-detail">{rec.detail}</p>
          {rec.areas && rec.areas.length > 0 && (
            <ul className="me-rec-areas">
              {rec.areas.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}
          <div className="me-rec-action">
            <Icons8Icon name="idea" size={13} />
            <span>{rec.action}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MEDashboard
