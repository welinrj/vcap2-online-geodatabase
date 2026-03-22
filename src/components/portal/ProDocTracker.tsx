import { useState, useMemo, useCallback, type FC, type ChangeEvent } from 'react'
import {
  PRODOC_TARGETS,
  type ProDocEntry,
} from '../../data/prodocTrackerData'
import { type ColumnDef } from '../../services/prodocStore'
import { useProDoc } from '../../contexts/useProDoc'
import { sumTerrestrial, sumMarine, isCCA, isMPA, computeProDocAnalytics } from '../../services/prodocAnalytics'
import Icons8Icon from '../Icons8Icon'
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


function createEmptyEntry(tab: Tab, customColumns: ColumnDef[]): ProDocEntry & Record<string, unknown> {
  const entry: ProDocEntry & Record<string, unknown> = {
    id: '',
    name: '',
    areaCouncil: '',
    beneficiary: '',
    ccaType: 'Terrestrial',
    status: tab === 'new' ? 'New' : 'Existing',
    xCoord: null,
    yCoord: null,
    scheduledTrip: '',
    mappingStatus: '',
    hectaresTerrestrial: null,
    hectaresMarine: null,
    remarks: '',
    registrationStatus: '',
  }
  for (const col of customColumns) {
    if (!col.builtin) {
      entry[col.key] = col.type === 'number' ? null : ''
    }
  }
  return entry
}

const ProDocTracker: FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const {
    newAreas, existingAreas, columns,
    setNewAreas, setExistingAreas, setColumns,
    isLoading, isDirty, isSaving, saveStatus,
    markDirty, handleSave,
  } = useProDoc()

  const [tab, setTab] = useState<Tab>('new')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showAddCol, setShowAddCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<'text' | 'number'>('text')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [dragColIndex, setDragColIndex] = useState<number | null>(null)
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null)

  // Column drag-and-drop handlers
  const handleColDragStart = useCallback((index: number) => {
    setDragColIndex(index)
  }, [])

  const handleColDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverColIndex(index)
  }, [])

  const handleColDrop = useCallback((targetIndex: number) => {
    if (dragColIndex === null || dragColIndex === targetIndex) {
      setDragColIndex(null)
      setDragOverColIndex(null)
      return
    }
    setColumns((prev) => {
      const updated = [...prev]
      const [moved] = updated.splice(dragColIndex, 1)
      updated.splice(targetIndex, 0, moved)
      return updated
    })
    setDragColIndex(null)
    setDragOverColIndex(null)
    markDirty()
  }, [dragColIndex, markDirty, setColumns])

  const handleColDragEnd = useCallback(() => {
    setDragColIndex(null)
    setDragOverColIndex(null)
  }, [])

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
    (index: number, field: string, value: string | number | null) => {
      setData((prev) => {
        const updated = [...prev]
        const entryIndex = prev.indexOf(filtered[index])
        if (entryIndex === -1) return prev
        updated[entryIndex] = { ...updated[entryIndex], [field]: value }
        return updated
      })
      markDirty()
    },
    [setData, filtered, markDirty]
  )

  const addRow = useCallback(() => {
    setData((prev) => [...prev, createEmptyEntry(tab, columns) as ProDocEntry])
    markDirty()
  }, [setData, tab, columns, markDirty])

  const deleteRow = useCallback(
    (index: number) => {
      setData((prev) => {
        const entryIndex = prev.indexOf(filtered[index])
        if (entryIndex === -1) return prev
        return prev.filter((_, i) => i !== entryIndex)
      })
      setDeleteConfirm(null)
      markDirty()
    },
    [setData, filtered, markDirty]
  )

  const addColumn = useCallback(() => {
    const trimmed = newColName.trim()
    if (!trimmed) return
    const key = 'custom_' + trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (columns.some((c) => c.key === key)) return
    const newCol: ColumnDef = { key, label: trimmed, type: newColType, builtin: false }
    setColumns((prev) => [...prev, newCol])
    // Add the field to all existing entries in both tabs
    const addField = (prev: ProDocEntry[]) =>
      prev.map((e) => ({ ...e, [key]: newColType === 'number' ? null : '' }))
    setNewAreas(addField)
    setExistingAreas(addField)
    setNewColName('')
    setShowAddCol(false)
    markDirty()
  }, [newColName, newColType, columns, markDirty, setColumns, setNewAreas, setExistingAreas])

  const removeColumn = useCallback(
    (key: string) => {
      setColumns((prev) => prev.filter((c) => c.key !== key))
      // Remove the field from all entries
      const removeField = (prev: ProDocEntry[]) =>
        prev.map((e) => {
          const copy = { ...e }
          delete (copy as unknown as Record<string, unknown>)[key]
          return copy
        })
      setNewAreas(removeField)
      setExistingAreas(removeField)
      markDirty()
    },
    [markDirty, setColumns, setNewAreas, setExistingAreas]
  )

  // Summary stats
  const allEntries = [...newAreas, ...existingAreas]

  const totalNewTerrestrial = sumTerrestrial(newAreas)
  const totalNewMarine = sumMarine(newAreas)
  const completedCount = allEntries.filter((e) => e.mappingStatus === 'Completed').length
  const inProgressCount = allEntries.filter((e) => e.mappingStatus === 'In Progress').length
  const withCoords = allEntries.filter((e) => e.xCoord !== null && e.yCoord !== null)

  // Registration status counts for CCA and MPA
  const ccaEntries = allEntries.filter(isCCA)
  const mpaEntries = allEntries.filter(isMPA)
  const ccaRegistered = ccaEntries.filter((e) => e.registrationStatus === 'Registered').length
  const ccaNotRegistered = ccaEntries.filter((e) => e.registrationStatus !== 'Registered').length
  const mpaRegistered = mpaEntries.filter((e) => e.registrationStatus === 'Registered').length
  const mpaNotRegistered = mpaEntries.filter((e) => e.registrationStatus !== 'Registered').length

  // ProDoc target progress — use shared analytics (registered entries only)
  const analytics = useMemo(
    () => computeProDocAnalytics(newAreas, existingAreas),
    [newAreas, existingAreas],
  )
  const prodocProgress = [
    { key: '1.1' as const, actual: analytics.newCcaHa },
    { key: '1.2' as const, actual: analytics.existCcaHa },
    { key: '2.1' as const, actual: analytics.newMpaHa },
    { key: '2.2' as const, actual: analytics.existMpaHa },
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
    const rawPct = target.targetHa > 0 ? (actual / target.targetHa) * 100 : 0
    return {
      name: key,
      value: Math.min(rawPct, 100), // cap visual bar at 100%
      rawPct,
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

  if (isLoading) {
    return (
      <div className="pdt">
        <div className="pdt-loading">
          <Icons8Icon name="clock" size={24} className="pdt-spinner" />
          <span>Loading ProDoc data...</span>
        </div>
      </div>
    )
  }

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
          {!readOnly && (
            <button
              className={`pdt-save-btn ${isDirty ? 'pdt-save-dirty' : ''} ${saveStatus === 'saved' ? 'pdt-save-success' : ''} ${saveStatus === 'error' ? 'pdt-save-error' : ''}`}
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title={isDirty ? 'Save changes to database' : 'No unsaved changes'}
            >
              {isSaving ? <Icons8Icon name="clock" size={14} className="pdt-spinner" /> : <Icons8Icon name="checkmark" size={14} />}
              {isSaving ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : isDirty ? 'Save Changes' : 'Saved'}
            </button>
          )}
          <span className="pdt-header-badge pdt-badge-new">
            <Icons8Icon name="leaf" size={12} />
            {newAreas.length} New
          </span>
          <span className="pdt-header-badge pdt-badge-existing">
            <Icons8Icon name="expand" size={12} />
            {existingAreas.length} Existing
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="pdt-stats">
        <div className="pdt-stat-card pdt-stat-green">
          <div className="pdt-stat-icon">
            <Icons8Icon name="globe" size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewTerrestrial)}</span>
            <span className="pdt-stat-label">New CCA (Terrestrial)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-blue">
          <div className="pdt-stat-icon">
            <Icons8Icon name="sea" size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{formatHa(totalNewMarine)}</span>
            <span className="pdt-stat-label">New MPA (Marine)</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-amber">
          <div className="pdt-stat-icon">
            <Icons8Icon name="approval" size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{completedCount}</span>
            <span className="pdt-stat-label">Completed</span>
          </div>
        </div>
        <div className="pdt-stat-card pdt-stat-purple">
          <div className="pdt-stat-icon">
            <Icons8Icon name="clock" size={20} />
          </div>
          <div className="pdt-stat-info">
            <span className="pdt-stat-value">{inProgressCount}</span>
            <span className="pdt-stat-label">In Progress</span>
          </div>
        </div>
      </div>

      {/* Registration Status */}
      <div className="pdt-registration-section">
        <h3 className="pdt-section-title">
          <Icons8Icon name="globe" size={18} className="pdt-section-icon" />
          Registration Status
        </h3>
        <div className="pdt-registration-grid">
          <div className="pdt-registration-card">
            <div className="pdt-registration-title">CCA (Community Conservation Areas)</div>
            <div className="pdt-registration-bars">
              <div className="pdt-registration-row">
                <span className="pdt-registration-label">Registered</span>
                <div className="pdt-registration-bar-track">
                  <div
                    className="pdt-registration-bar-fill pdt-fill-green"
                    style={{ width: ccaEntries.length > 0 ? `${(ccaRegistered / ccaEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="pdt-registration-count">{ccaRegistered}</span>
              </div>
              <div className="pdt-registration-row">
                <span className="pdt-registration-label">Not Registered</span>
                <div className="pdt-registration-bar-track">
                  <div
                    className="pdt-registration-bar-fill pdt-fill-amber"
                    style={{ width: ccaEntries.length > 0 ? `${(ccaNotRegistered / ccaEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="pdt-registration-count">{ccaNotRegistered}</span>
              </div>
            </div>
            <div className="pdt-registration-total">Total: {ccaEntries.length}</div>
          </div>
          <div className="pdt-registration-card">
            <div className="pdt-registration-title">MPA (Marine Protected Areas)</div>
            <div className="pdt-registration-bars">
              <div className="pdt-registration-row">
                <span className="pdt-registration-label">Registered</span>
                <div className="pdt-registration-bar-track">
                  <div
                    className="pdt-registration-bar-fill pdt-fill-blue"
                    style={{ width: mpaEntries.length > 0 ? `${(mpaRegistered / mpaEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="pdt-registration-count">{mpaRegistered}</span>
              </div>
              <div className="pdt-registration-row">
                <span className="pdt-registration-label">Not Registered</span>
                <div className="pdt-registration-bar-track">
                  <div
                    className="pdt-registration-bar-fill pdt-fill-amber"
                    style={{ width: mpaEntries.length > 0 ? `${(mpaNotRegistered / mpaEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="pdt-registration-count">{mpaNotRegistered}</span>
              </div>
            </div>
            <div className="pdt-registration-total">Total: {mpaEntries.length}</div>
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
                  {d.name}: {d.rawPct > 100 ? `>${100}` : d.rawPct.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>

          {/* Target cards */}
          <div className="pdt-target-grid">
            {prodocProgress.map(({ key, actual }) => {
              const target = PRODOC_TARGETS[key]
              const rawPct = target.targetHa > 0 ? (actual / target.targetHa) * 100 : 0
              const exceeded = rawPct > 100
              const isGreen = key.startsWith('1')
              return (
                <div key={key} className="pdt-target-card">
                  <div className="pdt-target-header">
                    <span className={`pdt-target-badge ${isGreen ? 'pdt-badge-cca' : 'pdt-badge-mpa'}`}>
                      {key}
                    </span>
                    <span className="pdt-target-pct">{exceeded ? '>100' : rawPct.toFixed(1)}%</span>
                  </div>
                  <div className="pdt-target-label">{target.label}</div>
                  <div className="pdt-progress-bar">
                    <div
                      className={`pdt-progress-fill ${isGreen ? 'pdt-fill-green' : 'pdt-fill-blue'}`}
                      style={{ width: `${Math.min(rawPct, 100)}%` }}
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
          <Icons8Icon name="map-pin" size={18} className="pdt-section-icon" />
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
            <Icons8Icon name="map-pin" size={18} className="pdt-section-icon" />
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
                  {e.mappingStatus === 'Completed' ? <Icons8Icon name="approval" size={10} /> : <Icons8Icon name="clock" size={10} />}
                  {e.mappingStatus || 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab toggle + filters + actions */}
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
        <div className="pdt-actions">
          {!readOnly && (
            <>
              <button className="pdt-action-btn pdt-action-add" onClick={addRow}>
                <Icons8Icon name="plus" size={14} />
                Add Row
              </button>
              <button
                className="pdt-action-btn pdt-action-col"
                onClick={() => setShowAddCol(!showAddCol)}
              >
                <Icons8Icon name="columns" size={14} />
                {showAddCol ? 'Cancel' : 'Add Column'}
              </button>
            </>
          )}
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
              <Icons8Icon name="chevron-right" size={14} className="pdt-filter-chevron" />
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
              <Icons8Icon name="chevron-right" size={14} className="pdt-filter-chevron" />
            </div>
          </div>
        </div>
      </div>

      {/* Add column form */}
      {showAddCol && !readOnly && (
        <div className="pdt-add-col-form">
          <input
            type="text"
            className="pdt-add-col-input"
            placeholder="Column name..."
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
            autoFocus
          />
          <select
            className="pdt-add-col-type"
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as 'text' | 'number')}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
          </select>
          <button className="pdt-action-btn pdt-action-add" onClick={addColumn}>
            <Icons8Icon name="plus" size={14} />
            Add
          </button>
        </div>
      )}

      {/* Data table */}
      <div className="pdt-table-wrap">
        <table className="pdt-table">
          <thead>
            <tr>
              {!readOnly && <th className="pdt-th-actions" />}
              {columns.map((col, colIdx) => (
                <th
                  key={col.key}
                  draggable={!readOnly}
                  onDragStart={() => handleColDragStart(colIdx)}
                  onDragOver={(e) => handleColDragOver(e, colIdx)}
                  onDrop={() => handleColDrop(colIdx)}
                  onDragEnd={handleColDragEnd}
                  className={`${dragOverColIndex === colIdx ? 'pdt-th-drag-over' : ''} ${dragColIndex === colIdx ? 'pdt-th-dragging' : ''}`}
                >
                  <div className="pdt-th-content">
                    {!readOnly && (
                      <span className="pdt-drag-handle" title="Drag to reorder">
                        <Icons8Icon name="columns" size={12} />
                      </span>
                    )}
                    <span>{col.label}</span>
                    {!readOnly && (
                      <button
                        className="pdt-col-remove"
                        title={`Remove "${col.label}" column`}
                        onClick={() => removeColumn(col.key)}
                      >
                        <Icons8Icon name="cancel" size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (readOnly ? 0 : 1)} className="pdt-empty">
                  No entries match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((entry, i) => (
                <EditableTableRow
                  key={`${entry.name}-${i}`}
                  entry={entry}
                  columns={columns}
                  onChange={(field, value) => updateEntry(i, field, value)}
                  onDelete={() =>
                    deleteConfirm === i ? deleteRow(i) : setDeleteConfirm(i)
                  }
                  isDeletePending={deleteConfirm === i}
                  onCancelDelete={() => setDeleteConfirm(null)}
                  readOnly={readOnly}
                />
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                {!readOnly && <td />}
                {columns.map((col, ci) => {
                  if (col.key === 'hectaresTerrestrial') {
                    return (
                      <td key={col.key} className="pdt-foot-val">
                        {formatHa(sumTerrestrial(filtered))}
                      </td>
                    )
                  }
                  if (col.key === 'hectaresMarine') {
                    return (
                      <td key={col.key} className="pdt-foot-val">
                        {formatHa(sumMarine(filtered))}
                      </td>
                    )
                  }
                  if (col.type === 'number' && !col.builtin) {
                    const sum = filtered.reduce((s, e) => {
                      const v = (e as unknown as Record<string, unknown>)[col.key]
                      return s + (typeof v === 'number' ? v : 0)
                    }, 0)
                    return (
                      <td key={col.key} className="pdt-foot-val">
                        {sum === 0 ? '\u2014' : sum.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </td>
                    )
                  }
                  // First non-action column gets "Totals" label
                  if (ci === 0) {
                    return <td key={col.key} className="pdt-foot-label">Totals</td>
                  }
                  return <td key={col.key} />
                })}
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
  columns: ColumnDef[]
  onChange: (field: string, value: string | number | null) => void
  onDelete: () => void
  isDeletePending: boolean
  onCancelDelete: () => void
  readOnly?: boolean
}> = ({ entry, columns, onChange, onDelete, isDeletePending, onCancelDelete, readOnly }) => {
  const handleText = (field: string) => (e: ChangeEvent<HTMLInputElement>) => {
    onChange(field, e.target.value)
  }

  const handleNumber = (field: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange(field, val === '' ? null : parseFloat(val))
  }

  const handleSelect = (field: string) => (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(field, e.target.value)
  }

  const rec = entry as unknown as Record<string, unknown>

  const getCellClass = (key: string) => {
    if (key === 'id') return 'pdt-cell-id'
    if (key === 'name') return 'pdt-cell-name'
    if (key === 'beneficiary') return 'pdt-cell-beneficiary'
    if (key === 'remarks') return 'pdt-cell-remarks'
    if (key === 'hectaresTerrestrial' || key === 'hectaresMarine') return 'pdt-cell-num'
    return ''
  }

  const formatValue = (value: unknown, col: ColumnDef): string => {
    if (value === null || value === undefined || value === '') return '\u2014'
    if (col.type === 'number') return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })
    return String(value)
  }

  return (
    <tr className={isDeletePending ? 'pdt-row-delete-pending' : ''}>
      {!readOnly && (
        <td className="pdt-cell-actions">
          {isDeletePending ? (
            <div className="pdt-delete-confirm">
              <button className="pdt-delete-yes" onClick={onDelete} title="Confirm delete">
                <Icons8Icon name="trash" size={12} />
              </button>
              <button className="pdt-delete-no" onClick={onCancelDelete} title="Cancel">
                <Icons8Icon name="cancel" size={12} />
              </button>
            </div>
          ) : (
            <button className="pdt-row-delete-btn" onClick={onDelete} title="Delete row">
              <Icons8Icon name="trash" size={13} />
            </button>
          )}
        </td>
      )}
      {columns.map((col) => {
        const cellClass = `${getCellClass(col.key)} ${readOnly ? '' : 'pdt-editable'}`
        const value = rec[col.key]

        if (readOnly) {
          return (
            <td key={col.key} className={cellClass}>
              {(col.key === 'mappingStatus' || col.key === 'registrationStatus') && value ? (
                <span className={`pdt-status-badge pdt-status-${String(value).toLowerCase().replace(/\s+/g, '-')}`}>
                  {String(value)}
                </span>
              ) : (
                formatValue(value, col)
              )}
            </td>
          )
        }

        if (col.type === 'select' && col.options) {
          return (
            <td key={col.key} className={cellClass}>
              <select
                value={String(value ?? '')}
                onChange={handleSelect(col.key)}
              >
                {col.options.map((opt) => (
                  <option key={opt || 'empty'} value={opt}>
                    {opt || 'Pending'}
                  </option>
                ))}
              </select>
            </td>
          )
        }

        if (col.type === 'number') {
          return (
            <td key={col.key} className={`pdt-cell-num pdt-editable`}>
              <input
                type="number"
                step="0.001"
                value={value === null || value === undefined ? '' : String(value)}
                onChange={handleNumber(col.key)}
                placeholder="\u2014"
              />
            </td>
          )
        }

        return (
          <td key={col.key} className={cellClass}>
            <input
              type="text"
              value={String(value ?? '')}
              onChange={handleText(col.key)}
              placeholder="\u2014"
            />
          </td>
        )
      })}
    </tr>
  )
}

export default ProDocTracker
