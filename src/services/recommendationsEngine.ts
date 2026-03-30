/**
 * Rules-based recommendations engine for the VCAP2 portal.
 * Analyses ProDoc indicators, activities, and fisheries data to produce
 * actionable "way forward" suggestions for decision makers.
 */
import type { ProDocEntry } from '../data/prodocTrackerData'
import type { Activity } from './activityStore'
import { computeIndicatorTracking, enforceAuthoritativeValues, enforceAuthoritativeExistingValues } from './prodocAnalytics'
import { PRODOC_TARGETS } from '../data/prodocTrackerData'

export type RecommendationSeverity = 'critical' | 'warning' | 'info'
export type RecommendationCategory = 'registration' | 'mapping' | 'budget' | 'deadline' | 'indicator' | 'milestone'

export interface Recommendation {
  id: string
  severity: RecommendationSeverity
  category: RecommendationCategory
  title: string
  detail: string
  areas?: string[]
  action: string
}

export interface RecommendationsResult {
  recommendations: Recommendation[]
  generatedAt: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Analyse all available data and return prioritised recommendations */
export function generateRecommendations(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
  activities: Activity[],
): RecommendationsResult {
  const recs: Recommendation[] = []

  // ── 1. ProDoc indicator gaps ──────────────────────────────────────────
  const tracking = computeIndicatorTracking(newAreas, existingAreas)

  for (const ind of tracking) {
    // Off-track indicators
    if (ind.status === 'off-track' && ind.progressPct < 50) {
      recs.push({
        id: `ind-critical-${ind.key}`,
        severity: 'critical',
        category: 'indicator',
        title: `Indicator ${ind.key} (${ind.label}) critically behind`,
        detail: `Only ${ind.progressPct.toFixed(1)}% of the ${ind.targetHa.toLocaleString()} ha target achieved. ${(ind.targetHa - ind.mappedHa).toLocaleString(undefined, { maximumFractionDigits: 1 })} ha still needed.`,
        action: `Accelerate boundary mapping and registration for ${ind.label.toLowerCase()} areas to close the gap before project end.`,
      })
    } else if (ind.status === 'off-track' && ind.progressPct >= 50) {
      recs.push({
        id: `ind-warn-${ind.key}`,
        severity: 'warning',
        category: 'indicator',
        title: `Indicator ${ind.key} (${ind.label}) needs attention`,
        detail: `${ind.progressPct.toFixed(1)}% progress — ${(ind.targetHa - ind.mappedHa).toLocaleString(undefined, { maximumFractionDigits: 1 })} ha short of target.`,
        action: `Review pipeline areas and confirm mapping schedules to meet the ${ind.targetHa.toLocaleString()} ha target.`,
      })
    }

    // Registration gaps on new areas
    const unregisteredNew = ind.notRegistered
    if (!ind.key.startsWith('1.') && !ind.key.startsWith('2.') ? false : unregisteredNew > 0 && !ind.key.includes('2')) {
      // handled below per area
    }
  }

  // ── 2. Unregistered new areas ─────────────────────────────────────────
  const correctedNew = newAreas.map(enforceAuthoritativeValues)
  const unregisteredNewAreas = correctedNew.filter(
    (a) => a.registrationStatus !== 'Registered' && a.mappingStatus === 'Completed',
  )
  if (unregisteredNewAreas.length > 0) {
    recs.push({
      id: 'reg-new-mapped',
      severity: 'warning',
      category: 'registration',
      title: `${unregisteredNewAreas.length} mapped new area${unregisteredNewAreas.length > 1 ? 's' : ''} not yet registered`,
      detail: `These areas have completed boundary mapping but have not been formally registered, preventing them from contributing to indicator targets.`,
      areas: unregisteredNewAreas.map((a) => a.name),
      action: 'Initiate formal registration process for all mapped areas — submit boundary files to the relevant government authority.',
    })
  }

  // ── 3. Unregistered existing areas ───────────────────────────────────
  const correctedExisting = existingAreas.map(enforceAuthoritativeExistingValues)
  const unregisteredExisting = correctedExisting.filter(
    (a) => a.registrationStatus !== 'Registered' && a.mappingStatus === 'Completed',
  )
  if (unregisteredExisting.length > 0) {
    recs.push({
      id: 'reg-exist-mapped',
      severity: 'warning',
      category: 'registration',
      title: `${unregisteredExisting.length} existing area${unregisteredExisting.length > 1 ? 's' : ''} mapped but not registered`,
      detail: `Mapped existing areas that are not yet registered cannot count toward the strengthened management targets (1.2 / 2.2).`,
      areas: unregisteredExisting.map((a) => a.name),
      action: 'Follow up with land owners and government offices to formalise registration.',
    })
  }

  // ── 4. Mapping not started ────────────────────────────────────────────
  const allAreas = [...correctedNew, ...correctedExisting]
  const notStarted = allAreas.filter((a) => a.mappingStatus === '')
  if (notStarted.length > 0) {
    recs.push({
      id: 'mapping-not-started',
      severity: notStarted.length > 5 ? 'critical' : 'warning',
      category: 'mapping',
      title: `${notStarted.length} area${notStarted.length > 1 ? 's' : ''} with mapping not started`,
      detail: `Areas without completed mapping cannot contribute to indicator targets or be registered.`,
      areas: notStarted.map((a) => a.name),
      action: 'Schedule field mapping missions for all areas where mapping has not started. Prioritise areas closest to project end date.',
    })
  }

  // ── 5. Activity overdue ───────────────────────────────────────────────
  const todayStr = today()
  const overdueActivities = activities.filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled' && (a.dueDate || a.endDate) && (a.dueDate || a.endDate) < todayStr,
  )
  if (overdueActivities.length > 0) {
    recs.push({
      id: 'activities-overdue',
      severity: 'critical',
      category: 'deadline',
      title: `${overdueActivities.length} overdue activit${overdueActivities.length > 1 ? 'ies' : 'y'}`,
      detail: `Activities past their due date that are not yet completed may delay indicator achievement.`,
      areas: overdueActivities.map((a) => a.title),
      action: 'Review and reschedule overdue activities, or update their status if completed. Escalate to supervisor if blocked.',
    })
  }

  // ── 6. Upcoming milestones (within 30 days) ───────────────────────────
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const in30Str = in30.toISOString().slice(0, 10)
  const upcomingMilestones = activities.filter(
    (a) => a.isMilestone && a.status !== 'completed' && a.dueDate && a.dueDate >= todayStr && a.dueDate <= in30Str,
  )
  if (upcomingMilestones.length > 0) {
    recs.push({
      id: 'milestones-upcoming',
      severity: 'info',
      category: 'milestone',
      title: `${upcomingMilestones.length} milestone${upcomingMilestones.length > 1 ? 's' : ''} due within 30 days`,
      detail: upcomingMilestones.map((m) => `${m.title} (due ${m.dueDate})`).join('; '),
      action: 'Ensure all resources are in place to deliver upcoming milestones on time.',
    })
  }

  // ── 7. Budget overruns ────────────────────────────────────────────────
  const overBudget = activities.filter(
    (a) => a.budgetVUV != null && a.actualVUV != null && a.actualVUV > a.budgetVUV * 1.1,
  )
  if (overBudget.length > 0) {
    recs.push({
      id: 'budget-overrun',
      severity: 'warning',
      category: 'budget',
      title: `${overBudget.length} activit${overBudget.length > 1 ? 'ies' : 'y'} over budget`,
      detail: `Activities where actual spend exceeds planned budget by >10%, which may indicate cost escalation.`,
      areas: overBudget.map((a) => a.title),
      action: 'Review cost drivers and submit a budget revision request if necessary. Identify savings elsewhere to offset overruns.',
    })
  }

  // ── 8. Large unspent budget ───────────────────────────────────────────
  const totalBudget = activities.reduce((s, a) => s + (a.budgetVUV ?? 0), 0)
  const totalActual = activities.reduce((s, a) => s + (a.actualVUV ?? 0), 0)
  if (totalBudget > 0 && totalActual / totalBudget < 0.3 && activities.filter((a) => a.budgetVUV != null).length > 2) {
    recs.push({
      id: 'budget-underspend',
      severity: 'info',
      category: 'budget',
      title: 'Low overall budget utilisation',
      detail: `Only ${((totalActual / totalBudget) * 100).toFixed(1)}% of total planned budget has been spent. Risk of end-of-project underspend.`,
      action: 'Accelerate planned activities to absorb budget before the project close date. Review uncommitted allocations.',
    })
  }

  // ── 9. Indicator 1.2 / 2.2 — no mapping completion ───────────────────
  const ind12 = tracking.find((t) => t.key === '1.2')
  if (ind12 && ind12.mappingCompleted === 0 && ind12.totalAreas > 0) {
    recs.push({
      id: 'ind-1-2-no-mapping',
      severity: 'critical',
      category: 'mapping',
      title: 'No existing CCAs have completed mapping (Indicator 1.2)',
      detail: `0 of ${ind12.totalAreas} existing CCA areas have completed boundary mapping. Without completed mapping AND registration, none can count toward the ${PRODOC_TARGETS['1.2'].targetHa.toLocaleString()} ha target.`,
      action: 'Schedule mapping missions for all existing CCAs immediately. Prioritise areas closest to completion.',
    })
  }

  // Sort: critical first, then warning, then info
  const order: Record<RecommendationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  recs.sort((a, b) => order[a.severity] - order[b.severity])

  return { recommendations: recs, generatedAt: new Date().toISOString() }
}
