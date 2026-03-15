import { useState, useMemo, type FC } from 'react'
import {
  newAreas,
  existingAreas,
  PRODOC_TARGETS,
  type ProDocEntry,
} from '../../data/prodocTrackerData'
import './ProDocTracker.css'

type Tab = 'new' | 'existing'
type TypeFilter = 'all' | 'Marine' | 'Marine & Terrestrial' | 'Terrestrial'
type StatusFilter = 'all' | 'Completed' | 'In Progress'

function formatHa(val: number | null): string {
  if (val === null || val === 0) return '—'
  return val.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ha'
}

const ProDocTracker: FC = () => {
  const [tab, setTab] = useState<Tab>('new')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const data = tab === 'new' ? newAreas : existingAreas

  const filtered = useMemo(() => {
    return data.filter((e) => {
      if (typeFilter !== 'all' && e.ccaType !== typeFilter) return false
      if (statusFilter !== 'all' && e.mappingStatus !== statusFilter) return false
      return true
    })
  }, [data, typeFilter, statusFilter])

  // Summary stats
  const allEntries = [...newAreas, ...existingAreas]
  const totalNewTerrestrial = newAreas.reduce((s, e) => s + (e.hectaresTerrestrial ?? 0), 0)
  const totalNewMarine = newAreas.reduce((s, e) => s + (e.hectaresMarine ?? 0), 0)
  const totalExistingTerrestrial = existingAreas.reduce((s, e) => s + (e.hectaresTerrestrial ?? 0), 0)
  const totalExistingMarine = existingAreas.reduce((s, e) => s + (e.hectaresMarine ?? 0), 0)
  const completedCount = allEntries.filter((e) => e.mappingStatus === 'Completed').length
  const inProgressCount = allEntries.filter((e) => e.mappingStatus === 'In Progress').length
  const withCoords = allEntries.filter((e) => e.xCoord !== null && e.yCoord !== null)

  // ProDoc target progress
  const prodocProgress = [
    { key: '1.1' as const, actual: totalNewTerrestrial },
    { key: '1.2' as const, actual: totalExistingTerrestrial },
    { key: '2.1' as const, actual: totalNewMarine },
    { key: '2.2' as const, actual: totalExistingMarine },
  ]

  // Area council breakdown (static data, no memo needed)
  const councilMap = new Map<string, { count: number; terrestrial: number; marine: number }>()
  allEntries.forEach((e) => {
    const existing = councilMap.get(e.areaCouncil) ?? { count: 0, terrestrial: 0, marine: 0 }
    existing.count++
    existing.terrestrial += e.hectaresTerrestrial ?? 0
    existing.marine += e.hectaresMarine ?? 0
    councilMap.set(e.areaCouncil, existing)
  })
  const councilBreakdown = Array.from(councilMap.entries()).sort((a, b) => b[1].count - a[1].count)

  return (
    <div className="pdt">
      {/* Header */}
      <div className="pdt-header">
        <div>
          <h2 className="pdt-title">ProDoc Indicator Tracker</h2>
          <p className="pdt-subtitle">
            CCA & MPA boundary mapping progress — New and Existing protected areas
          </p>
        </div>
        <div className="pdt-header-stats">
          <span className="pdt-header-badge pdt-badge-new">{newAreas.length} New</span>
          <span className="pdt-header-badge pdt-badge-existing">{existingAreas.length} Existing</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="pdt-stats">
        <div className="pdt-stat-card pdt-stat-green">
          <div className="pdt-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewTerrestrial)}</span>
            <span className="pdt-stat-label">New CCA (Terrestrial)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-blue">
          <div className="pdt-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewMarine)}</span>
            <span className="pdt-stat-label">New MPA (Marine)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-amber">
          <div className="pdt-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg>
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{completedCount}</span>
            <span className="pdt-stat-label">Completed</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-purple">
          <div className="pdt-stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{inProgressCount}</span>
            <span className="pdt-stat-label">In Progress</span>
          </div>
        </div>
      </div>

      {/* ProDoc target progress */}
      <div className="pdt-targets">
        <h3 className="pdt-section-title">ProDoc Indicator Targets</h3>
        <p className="pdt-section-desc">
          Progress towards end-of-project targets for community conservation and marine protected areas.
        </p>
        <div className="pdt-target-grid">
          {prodocProgress.map(({ key, actual }) => {
            const target = PRODOC_TARGETS[key]
            const pct = target.targetHa > 0 ? Math.min((actual / target.targetHa) * 100, 100) : 0
            const isGreen = key.startsWith('1')
            return (
              <div key={key} className="pdt-target-card">
                <div className="pdt-target-header">
                  <span className={`pdt-target-badge ${isGreen ? 'pdt-badge-cca' : 'pdt-badge-mpa'}`}>
                    {key}
                  </span>
                  <span className="pdt-target-pct">{pct.toFixed(1)}%</span>
                </div>
                <div className="pdt-target-label">{target.label}</div>
                <div className="pdt-progress-bar">
                  <div
                    className={`pdt-progress-fill ${isGreen ? 'pdt-fill-green' : 'pdt-fill-blue'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="pdt-target-nums">
                  <span>{actual.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha</span>
                  <span>/ {target.targetHa.toLocaleString()} ha</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Area council breakdown */}
      <div className="pdt-breakdown">
        <h3 className="pdt-section-title">Coverage by Area Council</h3>
        <div className="pdt-council-grid">
          {councilBreakdown.map(([council, stats]) => (
            <div key={council} className="pdt-council-row">
              <span className="pdt-council-name">{council}</span>
              <div className="pdt-council-tags">
                {stats.terrestrial > 0 && (
                  <span className="pdt-council-tag pdt-tag-green">{formatHa(stats.terrestrial)}</span>
                )}
                {stats.marine > 0 && (
                  <span className="pdt-council-tag pdt-tag-blue">{formatHa(stats.marine)}</span>
                )}
              </div>
              <span className="pdt-council-count">
                {stats.count} site{stats.count !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Coordinate map preview */}
      {withCoords.length > 0 && (
        <div className="pdt-coords-section">
          <h3 className="pdt-section-title">Sites with GPS Coordinates</h3>
          <p className="pdt-section-desc">
            {withCoords.length} of {allEntries.length} sites have recorded coordinates.
          </p>
          <div className="pdt-coords-grid">
            {withCoords.map((e, i) => (
              <div key={`${e.name}-${i}`} className="pdt-coord-card">
                <div className="pdt-coord-name">{e.name}</div>
                <div className="pdt-coord-council">{e.areaCouncil}</div>
                <div className="pdt-coord-val">
                  {e.yCoord?.toFixed(4)}, {e.xCoord?.toFixed(4)}
                </div>
                <span className={`pdt-coord-status ${e.mappingStatus === 'Completed' ? 'pdt-cs-done' : 'pdt-cs-prog'}`}>
                  {e.mappingStatus || 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab toggle + filters */}
      <div className="pdt-toolbar">
        <div className="pdt-tabs">
          <button
            className={`pdt-tab ${tab === 'new' ? 'pdt-tab-active' : ''}`}
            onClick={() => setTab('new')}
          >
            New Areas ({newAreas.length})
          </button>
          <button
            className={`pdt-tab ${tab === 'existing' ? 'pdt-tab-active' : ''}`}
            onClick={() => setTab('existing')}
          >
            Existing Areas ({existingAreas.length})
          </button>
        </div>
        <div className="pdt-filters">
          <select
            className="pdt-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">All Types</option>
            <option value="Marine">Marine</option>
            <option value="Marine & Terrestrial">Marine & Terrestrial</option>
            <option value="Terrestrial">Terrestrial</option>
          </select>
          <select
            className="pdt-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="In Progress">In Progress</option>
          </select>
        </div>
      </div>

      {/* Data table */}
      <div className="pdt-table-wrap">
        <table className="pdt-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Boundary Name</th>
              <th>Area Council</th>
              <th>Beneficiary</th>
              <th>Type</th>
              <th>Status</th>
              <th>Terrestrial (ha)</th>
              <th>Marine (ha)</th>
              <th>Mapping Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="pdt-empty">No entries match the current filters.</td>
              </tr>
            ) : (
              filtered.map((entry, i) => (
                <TableRow key={`${entry.name}-${i}`} entry={entry} />
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="pdt-foot-label">Totals</td>
                <td className="pdt-foot-val">
                  {formatHa(filtered.reduce((s, e) => s + (e.hectaresTerrestrial ?? 0), 0))}
                </td>
                <td className="pdt-foot-val">
                  {formatHa(filtered.reduce((s, e) => s + (e.hectaresMarine ?? 0), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

const TableRow: FC<{ entry: ProDocEntry }> = ({ entry }) => (
  <tr>
    <td className="pdt-cell-id">{entry.id || '—'}</td>
    <td className="pdt-cell-name">{entry.name}</td>
    <td>{entry.areaCouncil}</td>
    <td className="pdt-cell-beneficiary">{entry.beneficiary || '—'}</td>
    <td>
      <span className={`pdt-type-badge ${entry.ccaType === 'Marine' ? 'pdt-type-marine' : entry.ccaType === 'Terrestrial' ? 'pdt-type-terrestrial' : 'pdt-type-both'}`}>
        {entry.ccaType}
      </span>
    </td>
    <td>
      <span className={`pdt-status-badge ${entry.status === 'New' ? 'pdt-sb-new' : 'pdt-sb-existing'}`}>
        {entry.status}
      </span>
    </td>
    <td className="pdt-cell-num">{formatHa(entry.hectaresTerrestrial)}</td>
    <td className="pdt-cell-num">{formatHa(entry.hectaresMarine)}</td>
    <td>
      {entry.mappingStatus ? (
        <span className={`pdt-mapping-badge ${entry.mappingStatus === 'Completed' ? 'pdt-mb-done' : 'pdt-mb-prog'}`}>
          {entry.mappingStatus}
        </span>
      ) : (
        <span className="pdt-mapping-badge pdt-mb-pending">Pending</span>
      )}
    </td>
    <td className="pdt-cell-remarks">{entry.remarks || '—'}</td>
  </tr>
)

export default ProDocTracker
