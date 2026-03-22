import type { ProDocEntry } from '../data/prodocTrackerData'
import { PRODOC_TARGETS } from '../data/prodocTrackerData'

/** Map area councils to their province */
const AREA_COUNCIL_TO_PROVINCE: Record<string, string> = {
  'South Epi': 'Shefa',
  'South Maewo': 'Penama',
  'Toga Island (Torres)': 'Torba',
  'West Ambrym': 'Malampa',
  'West Coast Santo': 'Sanma',
  'East Vanualava': 'Torba',
  'Hiu Island (Torres)': 'Torba',
  'South East Tanna': 'Tafea',
  'Torba': 'Torba',
  'Sanma': 'Sanma',
  'Malampa': 'Malampa',
  'Shefa': 'Shefa',
  'Tafea': 'Tafea',
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
  const allAreas = [...newAreas, ...existingAreas]

  // Indicator hectares — only count registered entries as "achieved"
  const isRegistered = (e: ProDocEntry) => e.registrationStatus === 'Registered'
  const newRegistered = newAreas.filter(isRegistered)
  // Existing/strengthened areas require both registration AND completed mapping
  const isMappingComplete = (e: ProDocEntry) => e.mappingStatus === 'Completed'
  const existQualified = existingAreas.filter((e) => isRegistered(e) && isMappingComplete(e))
  const newCcaHa = sumTerrestrial(newRegistered)
  const existCcaHa = sumTerrestrial(existQualified)
  const newMpaHa = sumMarine(newRegistered)
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
