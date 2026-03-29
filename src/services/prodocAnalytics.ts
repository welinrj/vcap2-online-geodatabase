import type { ProDocEntry } from '../data/prodocTrackerData'
import { PRODOC_TARGETS } from '../data/prodocTrackerData'

/**
 * Authoritative values for new MPA entries confirmed from project documentation
 * (March 2026). These override whatever Firestore holds, so stale data in the
 * database can never affect indicator totals.
 */
/** Authoritative total mapped ha for indicator 2.1 (New MPA), confirmed March 2026. */
const AUTHORITATIVE_NEW_MPA_HA = 243.69

const AUTHORITATIVE_NEW_AREA_OVERRIDES: Record<string, Partial<Pick<ProDocEntry, 'hectaresMarine' | 'registrationStatus'>>> = {
  // New MPAs — only Wusi and Linduri are registered (confirmed March 2026)
  'MTPA2403': { hectaresMarine: 50.327, registrationStatus: 'Registered' },   // Wusi
  'MTPA2402': { registrationStatus: 'Registered' },                            // Linduri
  'MTPA2404': { registrationStatus: 'Not Yet Registered' },                    // Vasalea
  'MTPA2405': { registrationStatus: 'Not Yet Registered' },                    // Lonwolwol
  'MPA2511':  { registrationStatus: 'Not Yet Registered' },                    // Narovrovo
  'MPA2512':  { registrationStatus: 'Not Yet Registered' },                    // Naviso
  'MPA2513':  { registrationStatus: 'Not Yet Registered' },                    // Navenvene
  'MPA2514':  { registrationStatus: 'Not Yet Registered' },                    // Avanbatai
  'MPA2515':  { registrationStatus: 'Not Yet Registered' },                    // Nasawa
}

/** Apply authoritative overrides to a new-area entry before computing indicators.
 *  Trims the ID to handle any whitespace variation stored in Firestore. */
function enforceAuthoritativeValues(entry: ProDocEntry): ProDocEntry {
  const overrides = AUTHORITATIVE_NEW_AREA_OVERRIDES[entry.id.trim()]
  return overrides ? { ...entry, id: entry.id.trim(), ...overrides } : entry
}

/** Map area councils to their province */
const AREA_COUNCIL_TO_PROVINCE: Record<string, string> = {
  // Torba
  'Torba': 'Torba',
  'Torres': 'Torba',
  'Toga Island (Torres)': 'Torba',
  'Hiu Island (Torres)': 'Torba',
  'East Vanualava': 'Torba',
  // Sanma
  'Sanma': 'Sanma',
  'West Coast Santo': 'Sanma',
  // Penama
  'Penama': 'Penama',
  'South Maewo': 'Penama',
  // Malampa
  'Malampa': 'Malampa',
  'West Ambrym': 'Malampa',
  // Shefa
  'Shefa': 'Shefa',
  'South Epi': 'Shefa',
  // Tafea
  'Tafea': 'Tafea',
  'South East Tanna': 'Tafea',
  'Tanna': 'Tafea',
  'North Tanna': 'Tafea',
  'West Tanna': 'Tafea',
  'Middle Bush Tanna': 'Tafea',
  'Erromango': 'Tafea',
  'Aneityum': 'Tafea',
  'Anatom': 'Tafea',
  'Futuna': 'Tafea',
  'Aniwa': 'Tafea',
}

export function getProvince(areaCouncil: string): string {
  return AREA_COUNCIL_TO_PROVINCE[areaCouncil] ?? areaCouncil
}

export const isCCA = (e: ProDocEntry) =>
  e.ccaType === 'Terrestrial' || e.ccaType === 'Marine & Terrestrial'

export const isMPA = (e: ProDocEntry) =>
  e.ccaType === 'Marine' || e.ccaType === 'Marine & Terrestrial'

/** Sum terrestrial hectares for entries whose ccaType includes terrestrial */
export function sumTerrestrial(entries: ProDocEntry[]): number {
  return entries
    .filter(isCCA)
    .reduce((s, e) => s + (e.hectaresTerrestrial ?? 0), 0)
}

/** Sum marine hectares for entries whose ccaType includes marine */
export function sumMarine(entries: ProDocEntry[]): number {
  return entries
    .filter(isMPA)
    .reduce((s, e) => s + (e.hectaresMarine ?? 0), 0)
}

// Vanuatu targets — 30x30 Global Biodiversity Framework
export const CCA_TARGET_HA = 368_071.5 // 30% of Vanuatu surface coastal area
export const MPA_TARGET_HA = 20_520_000 // 30% of Vanuatu EEZ
export const VANUATU_LAND_HA = 1_226_905 // total surface coastal area
export const VANUATU_EEZ_HA = 68_400_000 // total EEZ

/** Tracking status for a ProDoc indicator (1.1, 1.2, 2.1, 2.2) */
export type IndicatorTrackingStatus = 'achieved' | 'on-track' | 'off-track'

export interface IndicatorIssue {
  issue: string
  severity: 'high' | 'medium'
  /** Names of areas contributing to this issue */
  areas?: string[]
}

export interface IndicatorTracking {
  key: string
  label: string
  status: IndicatorTrackingStatus
  progressPct: number
  mappedHa: number
  targetHa: number
  totalAreas: number
  mappingCompleted: number
  mappingInProgress: number
  mappingNotStarted: number
  registered: number
  notRegistered: number
  issues: IndicatorIssue[]
}

/** Compute tracking status for all four ProDoc indicators */
export function computeIndicatorTracking(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
): IndicatorTracking[] {
  const analytics = computeProDocAnalytics(newAreas, existingAreas)
  // Use corrected new areas for registration/mapping counts so they match the ha totals
  const correctedNewAreas = newAreas.map(enforceAuthoritativeValues)

  const indicators: Array<{
    key: string
    mappedHa: number
    progressPct: number
    areas: ProDocEntry[]
    filterFn: (e: ProDocEntry) => boolean
    sumFn: (entries: ProDocEntry[]) => number
    isExisting: boolean
  }> = [
    {
      key: '1.1', mappedHa: analytics.newCcaHa, progressPct: analytics.newCcaProgress,
      areas: correctedNewAreas, filterFn: isCCA, sumFn: sumTerrestrial, isExisting: false,
    },
    {
      key: '1.2', mappedHa: analytics.existCcaHa, progressPct: analytics.existCcaProgress,
      areas: existingAreas, filterFn: isCCA, sumFn: sumTerrestrial, isExisting: true,
    },
    {
      key: '2.1', mappedHa: analytics.newMpaHa, progressPct: analytics.newMpaProgress,
      areas: correctedNewAreas, filterFn: isMPA, sumFn: sumMarine, isExisting: false,
    },
    {
      key: '2.2', mappedHa: analytics.existMpaHa, progressPct: analytics.existMpaProgress,
      areas: existingAreas, filterFn: isMPA, sumFn: sumMarine, isExisting: true,
    },
  ]

  return indicators.map(({ key, mappedHa, progressPct, areas, filterFn, isExisting }) => {
    const target = PRODOC_TARGETS[key as keyof typeof PRODOC_TARGETS]
    const relevantAreas = areas.filter(filterFn)
    const totalAreas = relevantAreas.length

    const mappingCompleted = relevantAreas.filter((a) => a.mappingStatus === 'Completed').length
    const mappingInProgress = relevantAreas.filter((a) => a.mappingStatus === 'In Progress').length
    const mappingNotStarted = relevantAreas.filter((a) => a.mappingStatus === '').length
    const registered = relevantAreas.filter((a) => a.registrationStatus === 'Registered').length
    const notRegistered = totalAreas - registered

    // Determine issues
    const issues: IndicatorIssue[] = []

    // Hectare shortfall
    const shortfall = target.targetHa - mappedHa
    if (shortfall > 0) {
      issues.push({
        issue: `${shortfall.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha short of ${target.targetHa.toLocaleString()} ha target`,
        severity: progressPct < 50 ? 'high' : 'medium',
      })
    }

    // Mapping not started
    if (mappingNotStarted > 0) {
      const notStartedNames = relevantAreas.filter((a) => a.mappingStatus === '').map((a) => a.name)
      issues.push({
        issue: `${mappingNotStarted} of ${totalAreas} areas have mapping not started`,
        severity: 'high',
        areas: notStartedNames,
      })
    }

    // Registration gaps
    if (notRegistered > 0) {
      const unregNames = relevantAreas.filter((a) => a.registrationStatus !== 'Registered').map((a) => a.name)
      issues.push({
        issue: `${notRegistered} of ${totalAreas} areas not yet registered`,
        severity: isExisting ? 'high' : 'medium',
        areas: unregNames,
      })
    }

    // Areas with remarks flagging issues
    const remarkedAreas = relevantAreas.filter((a) => /reconfirm|remap|review|issue|problem|incorrect/i.test(a.remarks))
    if (remarkedAreas.length > 0) {
      issues.push({
        issue: `${remarkedAreas.length} area(s) with flagged issues in remarks`,
        severity: 'high',
        areas: remarkedAreas.map((a) => `${a.name}: ${a.remarks.slice(0, 60)}`),
      })
    }

    // Determine overall status
    let status: IndicatorTrackingStatus = 'on-track'
    if (progressPct >= 100) {
      status = 'achieved'
    } else {
      const highIssues = issues.filter((i) => i.severity === 'high').length
      if (highIssues > 0 || progressPct < 10) {
        status = 'off-track'
      }
    }

    return {
      key,
      label: target.label,
      status,
      progressPct,
      mappedHa,
      targetHa: target.targetHa,
      totalAreas,
      mappingCompleted,
      mappingInProgress,
      mappingNotStarted,
      registered,
      notRegistered,
      issues,
    }
  })
}

export interface ProDocAnalytics {
  // ProDoc indicator hectares
  newCcaHa: number
  existCcaHa: number
  newMpaHa: number
  existMpaHa: number
  // ProDoc indicator progress %
  newCcaProgress: number
  existCcaProgress: number
  newMpaProgress: number
  existMpaProgress: number
  // Combined totals
  totalCcaHa: number
  totalMpaHa: number
  // 30x30 progress (all entries, regardless of status)
  allTerrestrialHa: number
  allMarineHa: number
  ccaProgress: number
  mpaProgress: number
  ccaLandPercent: number
  mpaEezPercent: number
  ccaRemainingHa: number
  mpaRemainingHa: number
  // Counts
  newCcaCount: number
  newMpaCount: number
  improvedCcaCount: number
  improvedMpaCount: number
  // Mapping completion
  ccaMappedComplete: number
  ccaMappedLeft: number
  mpaMappedComplete: number
  mpaMappedLeft: number
  mappingCompleted: number
  mappingInProgress: number
  mappingNotStarted: number
  totalSites: number
  // Province breakdown
  provinceBarData: { name: string; fullName: string; Terrestrial: number; Marine: number; count: number }[]
}

/** Compute all analytics from ProDoc areas. Single source of truth for Dashboard & ProDocTracker. */
export function computeProDocAnalytics(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
): ProDocAnalytics {
  // Enforce authoritative values before computing indicator totals — prevents
  // stale Firestore data from affecting indicator 2.1 (new MPA ha)
  const correctedNewAreas = newAreas.map(enforceAuthoritativeValues)
  const allAreas = [...correctedNewAreas, ...existingAreas]

  // Indicator hectares — only count registered entries as "achieved"
  const isRegistered = (e: ProDocEntry) => e.registrationStatus === 'Registered'
  const newRegistered = correctedNewAreas.filter(isRegistered)
  // Existing/strengthened areas require both registration AND completed mapping
  const isMappingComplete = (e: ProDocEntry) => e.mappingStatus === 'Completed'
  const existQualified = existingAreas.filter((e) => isRegistered(e) && isMappingComplete(e))
  const newCcaHa = sumTerrestrial(newRegistered)
  const existCcaHa = sumTerrestrial(existQualified)
  const newMpaHa = AUTHORITATIVE_NEW_MPA_HA
  const existMpaHa = sumMarine(existQualified)

  // Indicator progress
  const newCcaProgress = Math.min((newCcaHa / PRODOC_TARGETS['1.1'].targetHa) * 100, 100)
  const existCcaProgress = Math.min((existCcaHa / PRODOC_TARGETS['1.2'].targetHa) * 100, 100)
  const newMpaProgress = Math.min((newMpaHa / PRODOC_TARGETS['2.1'].targetHa) * 100, 100)
  const existMpaProgress = Math.min((existMpaHa / PRODOC_TARGETS['2.2'].targetHa) * 100, 100)

  // Combined (indicator totals — filtered by registration/mapping)
  const totalCcaHa = newCcaHa + existCcaHa
  const totalMpaHa = newMpaHa + existMpaHa

  // 30x30 — uses ALL entries' hectares (new + existing, regardless of status)
  // divided by 30% of total land/EEZ
  const allTerrestrialHa = sumTerrestrial(allAreas)
  const allMarineHa = sumMarine(allAreas)
  const ccaProgress = CCA_TARGET_HA > 0 ? (allTerrestrialHa / CCA_TARGET_HA) * 100 : 0
  const mpaProgress = MPA_TARGET_HA > 0 ? (allMarineHa / MPA_TARGET_HA) * 100 : 0
  const ccaLandPercent = VANUATU_LAND_HA > 0 ? (allTerrestrialHa / VANUATU_LAND_HA) * 100 : 0
  const mpaEezPercent = VANUATU_EEZ_HA > 0 ? (allMarineHa / VANUATU_EEZ_HA) * 100 : 0
  const ccaRemainingHa = Math.max(CCA_TARGET_HA - allTerrestrialHa, 0)
  const mpaRemainingHa = Math.max(MPA_TARGET_HA - allMarineHa, 0)

  // Counts — only registered entries count towards targets
  const newCcaCount = newRegistered.filter(isCCA).length
  const newMpaCount = newRegistered.filter(isMPA).length
  const improvedCcaCount = existQualified.filter(isCCA).length
  const improvedMpaCount = existQualified.filter(isMPA).length

  // Mapping completion
  const ccaAreas = allAreas.filter(isCCA)
  const mpaAreas = allAreas.filter(isMPA)
  const ccaMappedComplete = ccaAreas.filter((a) => a.mappingStatus === 'Completed').length
  const ccaMappedLeft = ccaAreas.length - ccaMappedComplete
  const mpaMappedComplete = mpaAreas.filter((a) => a.mappingStatus === 'Completed').length
  const mpaMappedLeft = mpaAreas.length - mpaMappedComplete
  const mappingCompleted = allAreas.filter((a) => a.mappingStatus === 'Completed').length
  const mappingInProgress = allAreas.filter((a) => a.mappingStatus === 'In Progress').length
  const mappingNotStarted = allAreas.filter((a) => a.mappingStatus === '').length

  // Province breakdown
  const provinces = [...new Set(allAreas.map((a) => getProvince(a.areaCouncil)))].sort()
  const provinceBarData = provinces
    .map((province) => {
      const provinceAreas = allAreas.filter((a) => getProvince(a.areaCouncil) === province)
      return {
        name: province,
        fullName: province,
        Terrestrial: provinceAreas.reduce((s, a) => s + (a.hectaresTerrestrial ?? 0), 0),
        Marine: provinceAreas.reduce((s, a) => s + (a.hectaresMarine ?? 0), 0),
        count: provinceAreas.length,
      }
    })
    .filter((d) => d.Terrestrial > 0 || d.Marine > 0)

  return {
    newCcaHa, existCcaHa, newMpaHa, existMpaHa,
    newCcaProgress, existCcaProgress, newMpaProgress, existMpaProgress,
    totalCcaHa, totalMpaHa,
    allTerrestrialHa, allMarineHa,
    ccaProgress, mpaProgress, ccaLandPercent, mpaEezPercent,
    ccaRemainingHa, mpaRemainingHa,
    newCcaCount, newMpaCount, improvedCcaCount, improvedMpaCount,
    ccaMappedComplete, ccaMappedLeft, mpaMappedComplete, mpaMappedLeft,
    mappingCompleted, mappingInProgress, mappingNotStarted,
    totalSites: allAreas.length,
    provinceBarData,
  }
}
