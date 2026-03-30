/**
 * Exportable Progress Report generator.
 * Produces a multi-sheet Excel workbook (.xlsx) covering:
 *   1. Executive Summary
 *   2. ProDoc Indicators
 *   3. New Areas
 *   4. Existing Areas
 *   5. Activities & Budget
 *   6. Recommendations
 */
import * as XLSX from 'xlsx'
import type { ProDocEntry } from '../data/prodocTrackerData'
import type { Activity } from './activityStore'
import {
  computeIndicatorTracking,
  enforceAuthoritativeValues,
  enforceAuthoritativeExistingValues,
} from './prodocAnalytics'
import { generateRecommendations } from './recommendationsEngine'

function today(): string {
  return new Date().toLocaleDateString('en-VU', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtHa(v: number): string {
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`
}

function fmtVUV(v: number | null): string {
  if (v == null) return '—'
  return `VT ${v.toLocaleString()}`
}

export function exportProgressReport(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
  activities: Activity[],
): void {
  const wb = XLSX.utils.book_new()
  const today_ = today()
  const tracking = computeIndicatorTracking(newAreas, existingAreas)
  const { recommendations } = generateRecommendations(newAreas, existingAreas, activities)
  const correctedNew = newAreas.map(enforceAuthoritativeValues)
  const correctedExist = existingAreas.map(enforceAuthoritativeExistingValues)

  // ── Sheet 1: Executive Summary ──────────────────────────────
  const totalBudget = activities.reduce((s, a) => s + (a.budgetVUV ?? 0), 0)
  const totalActual = activities.reduce((s, a) => s + (a.actualVUV ?? 0), 0)
  const completed   = activities.filter((a) => a.status === 'completed').length
  const overdue     = activities.filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled' &&
           (a.dueDate || a.endDate) && (a.dueDate || a.endDate) < new Date().toISOString().slice(0, 10),
  ).length

  const summaryRows = [
    ['VCAP2 Progress Report'],
    ['Generated:', today_],
    [],
    ['INDICATOR', 'PROGRESS %', 'ACHIEVED (ha)', 'TARGET (ha)', 'STATUS'],
    ...tracking.map((t) => [
      `${t.key} — ${t.label}`,
      `${t.progressPct >= 100 ? '>100' : t.progressPct.toFixed(1)}%`,
      fmtHa(t.mappedHa),
      fmtHa(t.targetHa),
      t.status.toUpperCase(),
    ]),
    [],
    ['ACTIVITIES SUMMARY'],
    ['Total Activities', activities.length],
    ['Completed', completed],
    ['Overdue', overdue],
    ['Total Budget (VUV)', fmtVUV(totalBudget)],
    ['Total Spent (VUV)', fmtVUV(totalActual)],
    ['Budget Utilisation', totalBudget > 0 ? `${((totalActual / totalBudget) * 100).toFixed(1)}%` : '—'],
    [],
    ['RECOMMENDATIONS SUMMARY'],
    ['Critical Issues', recommendations.filter((r) => r.severity === 'critical').length],
    ['Warnings', recommendations.filter((r) => r.severity === 'warning').length],
    ['Info Items', recommendations.filter((r) => r.severity === 'info').length],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Executive Summary')

  // ── Sheet 2: ProDoc Indicators ──────────────────────────────
  const indRows = [
    ['VCAP2 — ProDoc Indicator Details', '', '', '', '', today_],
    [],
    ['Indicator', 'Label', 'Progress %', 'Achieved (ha)', 'Target (ha)', 'Total Areas', 'Mapped', 'Registered', 'Status'],
    ...tracking.map((t) => [
      t.key, t.label,
      t.progressPct >= 100 ? '>100%' : `${t.progressPct.toFixed(1)}%`,
      t.mappedHa, t.targetHa, t.totalAreas, t.mappingCompleted, t.registered,
      t.status,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(indRows)
  ws2['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'ProDoc Indicators')

  // ── Sheet 3: New Areas ──────────────────────────────────────
  const newRows = [
    ['VCAP2 — New Protected Areas', '', '', '', '', '', today_],
    [],
    ['ID', 'Name', 'Area Council', 'Type', 'Mapping Status', 'Registration', 'Terrestrial (ha)', 'Marine (ha)'],
    ...correctedNew.map((a) => [
      a.id, a.name, a.areaCouncil, a.ccaType,
      a.mappingStatus || 'Not Started',
      a.registrationStatus || 'Not Registered',
      a.hectaresTerrestrial ?? '', a.hectaresMarine ?? '',
    ]),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(newRows)
  ws3['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'New Areas')

  // ── Sheet 4: Existing Areas ─────────────────────────────────
  const existRows = [
    ['VCAP2 — Existing Protected Areas', '', '', '', '', '', today_],
    [],
    ['ID', 'Name', 'Area Council', 'Type', 'Mapping Status', 'Registration', 'Terrestrial (ha)', 'Marine (ha)'],
    ...correctedExist.map((a) => [
      a.id, a.name, a.areaCouncil, a.ccaType,
      a.mappingStatus || 'Not Started',
      a.registrationStatus || 'Not Registered',
      a.hectaresTerrestrial ?? '', a.hectaresMarine ?? '',
    ]),
  ]
  const ws4 = XLSX.utils.aoa_to_sheet(existRows)
  ws4['!cols'] = ws3['!cols']
  XLSX.utils.book_append_sheet(wb, ws4, 'Existing Areas')

  // ── Sheet 5: Activities & Budget ────────────────────────────
  const actRows = [
    ['VCAP2 — Activities & Budget', '', '', '', '', '', today_],
    [],
    ['Title', 'Type', 'Status', 'Priority', 'Indicator', 'Assigned To', 'Start Date', 'Due Date', 'Budget (VUV)', 'Actual (VUV)', 'Variance (VUV)', 'Area'],
    ...activities.map((a) => {
      const variance = a.budgetVUV != null && a.actualVUV != null ? a.actualVUV - a.budgetVUV : ''
      return [
        a.title, a.type, a.status, a.priority,
        a.prodocIndicator || '—',
        a.assignedToName || '—',
        a.startDate || '', a.dueDate || a.endDate || '',
        a.budgetVUV ?? '', a.actualVUV ?? '', variance,
        a.areaName || '—',
      ]
    }),
    [],
    ['', '', '', '', '', '', '', 'TOTALS', totalBudget, totalActual, totalActual - totalBudget],
  ]
  const ws5 = XLSX.utils.aoa_to_sheet(actRows)
  ws5['!cols'] = [
    { wch: 36 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, ws5, 'Activities & Budget')

  // ── Sheet 6: Recommendations ────────────────────────────────
  const recRows = [
    ['VCAP2 — Recommendations & Way Forward', '', '', '', today_],
    [],
    ['Severity', 'Category', 'Issue', 'Detail', 'Recommended Action', 'Affected Areas'],
    ...recommendations.map((r) => [
      r.severity.toUpperCase(), r.category,
      r.title, r.detail, r.action,
      r.areas ? r.areas.join('; ') : '—',
    ]),
  ]
  const ws6 = XLSX.utils.aoa_to_sheet(recRows)
  ws6['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 40 }, { wch: 50 }, { wch: 55 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, ws6, 'Recommendations')

  // ── Download ────────────────────────────────────────────────
  const filename = `VCAP2_Progress_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
