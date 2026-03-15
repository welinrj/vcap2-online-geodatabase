import { useState, useMemo, useCallback, type FC, type ChangeEvent } from 'react'
import {
  newAreas as initialNewAreas,
  existingAreas as initialExistingAreas,
  PRODOC_TARGETS,
  type ProDocEntry,
} from '../../data/prodocTrackerData'
import {
  ShieldCheck,
  Waves,
  CheckCircle2,
  Clock,
  MapPin,
  TreePine,
  ArrowUpRight,
  ChevronDown,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  RadialBarChart,
  RadialBar,
} from 'recharts'
import './ProDocTracker.css'

type Tab = 'new' | 'existing'
type TypeFilter = 'all' | 'Marine' | 'Marine & Terrestrial' | 'Terrestrial'
type StatusFilter = 'all' | 'Completed' | 'In Progress'

function formatHa(val: number | null): string {
  if (val === null || val === 0) return '\u2014'
  return val.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ha'
}

const COLORS = {
  green: '#22c55e',
  blue: '#3b82f6',
  amber: '#f59e0b',
  purple: '#a855f7',
  gray: '#e2e8f0',
}

const CCA_TYPES: ProDocEntry['ccaType'][] = ['Marine', 'Marine & Terrestrial', 'Terrestrial']
const STATUSES: ProDocEntry['status'][] = ['New', 'Existing']
const MAPPING_STATUSES: ProDocEntry['mappingStatus'][] = ['Completed', 'In Progress', '']

const ProDocTracker: FC = () => {
  const [tab, setTab] = useState<Tab>('new')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [newAreas, setNewAreas] = useState<ProDocEntry[]>(() => [...initialNewAreas])
  const [existingAreas, setExistingAreas] = useState<ProDocEntry[]>(() => [...initialExistingAreas])

  const data = tab === 'new' ? newAreas : existingAreas
  const setData = tab === 'new' ? setNewAreas : setExistingAreas

  const filtered = useMemo(() => {
    return data.filter((e) => {
      if (typeFilter !== 'all' && e.ccaType !== typeFilter) return false
      if (statusFilter !== 'all' && e.mappingStatus !== statusFilter) return false
      return true
    })
  }, [data, typeFilter, statusFilter])

  const updateEntry = useCallback(
    (index: number, field: keyof ProDocEntry, value: string | number | null) => {
      setData((prev) => {
        const updated = [...prev]
        const entryIndex = prev.indexOf(filtered[index])
        if (entryIndex === -1) return prev
        updated[entryIndex] = { ...updated[entryIndex], [field]: value }
        return updated
      })
    },
    [setData, filtered]
  )

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
    { key: '1.1' as const, actual: totalNewTerrestrial, label: 'New CCA Terrestrial' },
    { key: '1.2' as const, actual: totalExistingTerrestrial, label: 'Existing CCA Terrestrial' },
    { key: '2.1' as const, actual: totalNewMarine, label: 'New MPA Marine' },
    { key: '2.2' as const, actual: totalExistingMarine, label: 'Existing MPA Marine' },
  ]

  // Area council breakdown
  const councilMap = new Map<string, { count: number; terrestrial: number; marine: number }>()
  allEntries.forEach((e) => {
    const existing = councilMap.get(e.areaCouncil) ?? { count: 0, terrestrial: 0, marine: 0 }
    existing.count++
    existing.terrestrial += e.hectaresTerrestrial ?? 0
    existing.marine += e.hectaresMarine ?? 0
    councilMap.set(e.areaCouncil, existing)
  })
  const councilBreakdown = Array.from(councilMap.entries()).sort((a, b) => b[1].count - a[1].count)

  // Radial bar data for ProDoc targets
  const radialData = prodocProgress.map(({ key, actual }) => {
    const target = PRODOC_TARGETS[key]
    const pct = target.targetHa > 0 ? Math.min((actual / target.targetHa) * 100, 100) : 0
    return {
      name: key,
      value: pct,
      fill: key.startsWith('1') ? COLORS.green : COLORS.blue,
    }
  })

  // Council bar chart data
  const councilBarData = councilBreakdown.slice(0, 8).map(([council, stats]) => ({
    name: council.length > 14 ? council.slice(0, 14) + '...' : council,
    fullName: council,
    Terrestrial: stats.terrestrial,
    Marine: stats.marine,
    sites: stats.count,
  }))

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
          <span className="pdt-header-badge pdt-badge-new">
            <TreePine size={12} />
            {newAreas.length} New
          </span>
          <span className="pdt-header-badge pdt-badge-existing">
            <ArrowUpRight size={12} />
            {existingAreas.length} Existing
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="pdt-stats">
        <div className="pdt-stat-card pdt-stat-green">
          <div className="pdt-stat-icon">
            <ShieldCheck size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewTerrestrial)}</span>
            <span className="pdt-stat-label">New CCA (Terrestrial)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-blue">
          <div className="pdt-stat-icon">
            <Waves size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewMarine)}</span>
            <span className="pdt-stat-label">New MPA (Marine)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-amber">
          <div className="pdt-stat-icon">
            <CheckCircle2 size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{completedCount}</span>
            <span className="pdt-stat-label">Completed</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-purple">
          <div className="pdt-stat-icon">
            <Clock size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{inProgressCount}</span>
            <span className="pdt-stat-label">In Progress</span>
          </div>
        </div>
      </div>

      {/* ProDoc target progress with radial + bar chart */}
      <div className="pdt-targets">
        <h3 className="pdt-section-title">ProDoc Indicator Targets</h3>
        <p className="pdt-section-desc">
          Progress towards end-of-project targets for community conservation and marine protected areas.
        </p>

        <div className="pdt-targets-layout">
          {/* Radial gauge */}
          <div className="pdt-radial-chart">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="30%"
                outerRadius="90%"
                data={radialData}
                startAngle={180}
                endAngle={0}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={6}
                  background={{ fill: '#f1f5f9' }}
                >
                  {radialData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </RadialBar>
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pdt-radial-legend">
              {radialData.map((d) => (
                <span key={d.name} className="pdt-radial-legend-item">
                  <span className="pdt-radial-dot" style={{ background: d.fill }} />
                  {d.name}: {d.value.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>

          {/* Target cards */}
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
      </div>

      {/* Area council breakdown with bar chart */}
      <div className="pdt-breakdown">
        <h3 className="pdt-section-title">
          <MapPin size={18} className="pdt-section-icon" />
          Coverage by Area Council
        </h3>
        {councilBarData.length > 0 && (
          <div className="pdt-council-chart">
            <ResponsiveContainer width="100%" height={Math.max(180, councilBarData.length * 36)}>
              <BarChart
                data={councilBarData}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  unit=" ha"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [formatHa(Number(value)), String(name)]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Bar dataKey="Terrestrial" fill={COLORS.green} radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="Marine" fill={COLORS.blue} radius={[0, 4, 4, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
            <div className="pdt-council-chart-legend">
              <span className="pdt-chart-legend-item">
                <span className="pdt-legend-dot" style={{ background: COLORS.green }} />
                Terrestrial
              </span>
              <span className="pdt-chart-legend-item">
                <span className="pdt-legend-dot" style={{ background: COLORS.blue }} />
                Marine
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Coordinate map preview */}
      {withCoords.length > 0 && (
        <div className="pdt-coords-section">
          <h3 className="pdt-section-title">
            <MapPin size={18} className="pdt-section-icon" />
            Sites with GPS Coordinates
          </h3>
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
                  {e.mappingStatus === 'Completed' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
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
          <div className="pdt-filter-wrapper">
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
            <ChevronDown size={14} className="pdt-filter-chevron" />
          </div>
          <div className="pdt-filter-wrapper">
            <select
              className="pdt-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
            </select>
            <ChevronDown size={14} className="pdt-filter-chevron" />
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="pdt-table-wrap">
        <table className="pdt-table">
          <colgroup>
            <col className="pdt-col-id" />
            <col className="pdt-col-name" />
            <col className="pdt-col-council" />
            <col className="pdt-col-beneficiary" />
            <col className="pdt-col-type" />
            <col className="pdt-col-status" />
            <col className="pdt-col-terrestrial" />
            <col className="pdt-col-marine" />
            <col className="pdt-col-mapping" />
            <col className="pdt-col-remarks" />
          </colgroup>
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
                <EditableTableRow
                  key={`${entry.name}-${i}`}
                  entry={entry}
                  onChange={(field, value) => updateEntry(i, field, value)}
                />
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

const EditableTableRow: FC<{
  entry: ProDocEntry
  onChange: (field: keyof ProDocEntry, value: string | number | null) => void
}> = ({ entry, onChange }) => {
  const handleText = (field: keyof ProDocEntry) => (e: ChangeEvent<HTMLInputElement>) => {
    onChange(field, e.target.value)
  }

  const handleNumber = (field: keyof ProDocEntry) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(field, val === '' ? null : parseFloat(val))
  }

  const handleSelect = (field: keyof ProDocEntry) => (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(field, e.target.value)
  }

  return (
    <tr>
      <td className="pdt-cell-id pdt-editable">
        <input
          type="text"
          value={entry.id}
          onChange={handleText('id')}
          placeholder="\u2014"
        />
      </td>
      <td className="pdt-cell-name pdt-editable">
        <input
          type="text"
          value={entry.name}
          onChange={handleText('name')}
        />
      </td>
      <td className="pdt-editable">
        <input
          type="text"
          value={entry.areaCouncil}
          onChange={handleText('areaCouncil')}
        />
      </td>
      <td className="pdt-cell-beneficiary pdt-editable">
        <input
          type="text"
          value={entry.beneficiary}
          onChange={handleText('beneficiary')}
          placeholder="\u2014"
        />
      </td>
      <td className="pdt-editable">
        <select value={entry.ccaType} onChange={handleSelect('ccaType')}>
          {CCA_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="pdt-editable">
        <select value={entry.status} onChange={handleSelect('status')}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </td>
      <td className="pdt-cell-num pdt-editable">
        <input
          type="number"
          step="0.001"
          value={entry.hectaresTerrestrial ?? ''}
          onChange={handleNumber('hectaresTerrestrial')}
          placeholder="\u2014"
        />
      </td>
      <td className="pdt-cell-num pdt-editable">
        <input
          type="number"
          step="0.001"
          value={entry.hectaresMarine ?? ''}
          onChange={handleNumber('hectaresMarine')}
          placeholder="\u2014"
        />
      </td>
      <td className="pdt-editable">
        <select value={entry.mappingStatus} onChange={handleSelect('mappingStatus')}>
          {MAPPING_STATUSES.map((ms) => (
            <option key={ms || 'pending'} value={ms}>{ms || 'Pending'}</option>
          ))}
        </select>
      </td>
      <td className="pdt-cell-remarks pdt-editable">
        <input
          type="text"
          value={entry.remarks}
          onChange={handleText('remarks')}
          placeholder="\u2014"
        />
      </td>
    </tr>
  )
}

export default ProDocTracker
