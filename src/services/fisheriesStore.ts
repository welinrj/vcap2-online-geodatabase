import {
  collection, doc, getDocs, setDoc, writeBatch
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  FisheriesActivity, ActivityProgress, FisheriesIndicator, IndicatorProgress,
  Quarter, ActivityStatus
} from '../types/fisheries'

// Firestore collection names
const ACTIVITIES_COL = 'fisheries_activities'
const PROGRESS_COL = 'fisheries_progress'
const INDICATORS_COL = 'fisheries_indicators'
const IND_PROGRESS_COL = 'fisheries_indicator_progress'

// ── SEED DATA ────────────────────────────────────────────────────────────────

const SEED_ACTIVITIES: Omit<FisheriesActivity, 'id'>[] = [
  { code: '1.1.1.2.a', description: 'BIORAP Assessment (Marine/Terrestrial) — 2 BIORAPs + PA site assessment', output: '1.1.1', fund: 'LDCF', glAccount: '72100', budgetUsd: 102819, q1Budget: 52819, q2Budget: 50000, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.2.b', description: 'Travel for BIORAP assessment', output: '1.1.1', fund: 'GEF/TF', glAccount: '71600', budgetUsd: 105000, q1Budget: 70000, q2Budget: 0, q3Budget: 35000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.2.c', description: 'Development of awareness materials by NGO', output: '1.1.1', fund: 'LDCF', glAccount: '72100', budgetUsd: 3000, q1Budget: 0, q2Budget: 3000, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.2.d', description: 'Mapping of newly created and existing Protected Areas in all project sites', output: '1.1.1', fund: 'GEF/TF', glAccount: '71600', budgetUsd: 5000, q1Budget: 2500, q2Budget: 2500, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.3.a', description: 'Community meetings & awareness for CCAs / Marine Protected Areas', output: '1.1.1', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 6000, q1Budget: 1500, q2Budget: 2500, q3Budget: 2000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.4.a', description: 'National Protected Area Planning Workshop', output: '1.1.1', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 5000, q1Budget: 2000, q2Budget: 3000, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.4.b', description: 'Local meetings with communities', output: '1.1.1', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 1000, q1Budget: 1000, q2Budget: 0, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.5.a', description: 'Detailed Management Plan Assessment and Preparation by NGO', output: '1.1.1', fund: 'LDCF', glAccount: '72100', budgetUsd: 11900, q1Budget: 3950, q2Budget: 4000, q3Budget: 3950, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.1.5.b', description: 'Management Plan Implementation by NGO for 6 PA sites', output: '1.1.1', fund: 'LDCF', glAccount: '72100', budgetUsd: 60000, q1Budget: 20000, q2Budget: 20000, q3Budget: 20000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.1.a', description: 'Community PA management planning (FPIC process)', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 6000, q1Budget: 2000, q2Budget: 2000, q3Budget: 2000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.1.b', description: 'GESI-responsive community activities', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 2000, q1Budget: 1000, q2Budget: 1000, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.2.a', description: 'Meetings to draft & validate participatory community management plans', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 1000, q1Budget: 500, q2Budget: 500, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.2.b', description: 'Review of PA management plans (8 sites)', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 6000, q1Budget: 2000, q2Budget: 2000, q3Budget: 2000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.2.c', description: 'METT consultations in all 6 provinces', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 6000, q1Budget: 2000, q2Budget: 2000, q3Budget: 2000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.2.d', description: 'Implementation of PA Action Plans in all provinces', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 6000, q1Budget: 2000, q2Budget: 2000, q3Budget: 2000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.2.5.a', description: 'Launching of PA management plans in 6 provinces (incl. signboards)', output: '1.1.2', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 20000, q1Budget: 0, q2Budget: 10000, q3Budget: 10000, q4Budget: 0, responsible: 'IP 009198' },
  { code: '1.1.3.2.a', description: 'Community meetings with provincial govts for annual workplan', output: '1.1.3', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 1000, q1Budget: 1000, q2Budget: 0, q3Budget: 0, q4Budget: 0, responsible: 'IP 009198' },
  { code: '3.2.1.1.b', description: 'National PA Specialist — Coastal Review', output: '3.2.1', fund: 'GEF/TF', glAccount: '71200', budgetUsd: 8000, q1Budget: 2000, q2Budget: 2000, q3Budget: 2000, q4Budget: 2000, responsible: 'IP 009198' },
  { code: '3.2.1.2.a', description: 'ICZM consultative meetings', output: '3.2.1', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 5000, q1Budget: 1250, q2Budget: 1250, q3Budget: 1250, q4Budget: 1250, responsible: 'IP 009198' },
  { code: '3.3.x', description: 'Climate change community trainings (coastal zones)', output: '3.2.1', fund: 'GEF/TF', glAccount: '75700', budgetUsd: 20000, q1Budget: 5000, q2Budget: 5000, q3Budget: 5000, q4Budget: 5000, responsible: 'IP 009198' },
  { code: '1.1.1.1.m', description: 'Fisheries Component Coordinator (Betgy Boedovo, 18 months, starts 3 Jul 2026)', output: '1.1.1', fund: 'GEF/TF', glAccount: '71800', budgetUsd: 20642, q1Budget: 0, q2Budget: 5160.50, q3Budget: 5160.50, q4Budget: 5160.50, responsible: 'Betgy Boedovo', notes: '18 months starting 3 Jul 2026' },
]

const SEED_INDICATORS: Omit<FisheriesIndicator, 'id'>[] = [
  { code: '2.1',  name: 'Marine protected areas newly created',           baselineValue: 192,  targetValue: 191.5, unit: 'ha' },
  { code: '2.2',  name: 'Marine PAs under improved management',           baselineValue: 284,  targetValue: 741,   unit: 'ha' },
  { code: 'CI5',  name: 'Marine habitat under improved practices',        baselineValue: 0,    targetValue: 2000,  unit: 'ha' },
  { code: '5.1',  name: 'Local species action plans developed & implemented', baselineValue: 0, targetValue: 2,   unit: 'plans' },
]

// ── LOCAL SEED DATA (used as fallback when Firestore is unavailable) ─────────

function buildLocalActivities(): FisheriesActivity[] {
  return SEED_ACTIVITIES.map((act, i) => ({
    id: `act_${String(i + 1).padStart(3, '0')}`,
    ...act,
  }))
}

function buildLocalIndicators(): FisheriesIndicator[] {
  return SEED_INDICATORS.map((ind, i) => ({
    id: `ind_${String(i + 1).padStart(3, '0')}`,
    ...ind,
  }))
}

// ── SEED FUNCTION ─────────────────────────────────────────────────────────────

export async function seedFisheriesData(): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, ACTIVITIES_COL))
    if (snapshot.size > 0) return

    const batch = writeBatch(db)

    SEED_ACTIVITIES.forEach((act, i) => {
      const id = `act_${String(i + 1).padStart(3, '0')}`
      const ref = doc(db, ACTIVITIES_COL, id)
      batch.set(ref, { id, ...act })
    })

    SEED_INDICATORS.forEach((ind, i) => {
      const id = `ind_${String(i + 1).padStart(3, '0')}`
      const ref = doc(db, INDICATORS_COL, id)
      batch.set(ref, { id, ...ind })
    })

    await batch.commit()
  } catch (err) {
    console.warn('seedFisheriesData: Firestore unavailable, using local data', err)
  }
}

// ── ACTIVITIES ────────────────────────────────────────────────────────────────

export async function listActivities(): Promise<FisheriesActivity[]> {
  try {
    const snap = await getDocs(collection(db, ACTIVITIES_COL))
    if (snap.size > 0) return snap.docs.map(d => d.data() as FisheriesActivity)
  } catch (err) {
    console.warn('listActivities: Firestore unavailable, using local data', err)
  }
  return buildLocalActivities()
}

// ── ACTIVITY PROGRESS ─────────────────────────────────────────────────────────

export async function listProgress(activityId: string): Promise<ActivityProgress[]> {
  const snap = await getDocs(collection(db, PROGRESS_COL))
  return snap.docs
    .map(d => d.data() as ActivityProgress)
    .filter(p => p.activityId === activityId)
}

export async function listAllProgress(): Promise<ActivityProgress[]> {
  try {
    const snap = await getDocs(collection(db, PROGRESS_COL))
    return snap.docs.map(d => d.data() as ActivityProgress)
  } catch (err) {
    console.warn('listAllProgress: Firestore unavailable', err)
    return []
  }
}

export async function upsertProgress(
  activityId: string,
  quarter: Quarter,
  data: { status: ActivityStatus; actualUsd: number; percentDone: number; notes: string; updatedBy: string }
): Promise<ActivityProgress> {
  const id = `prog_${activityId}_${quarter}`
  const progress: ActivityProgress = {
    id,
    activityId,
    quarter,
    status: data.status,
    actualUsd: data.actualUsd,
    percentDone: data.percentDone,
    notes: data.notes,
    updatedAt: new Date().toISOString(),
    updatedBy: data.updatedBy,
  }
  await setDoc(doc(db, PROGRESS_COL, id), progress)
  return progress
}

// ── INDICATORS ────────────────────────────────────────────────────────────────

export async function listIndicators(): Promise<FisheriesIndicator[]> {
  try {
    const snap = await getDocs(collection(db, INDICATORS_COL))
    if (snap.size > 0) return snap.docs.map(d => d.data() as FisheriesIndicator)
  } catch (err) {
    console.warn('listIndicators: Firestore unavailable, using local data', err)
  }
  return buildLocalIndicators()
}

export async function listAllIndicatorProgress(): Promise<IndicatorProgress[]> {
  try {
    const snap = await getDocs(collection(db, IND_PROGRESS_COL))
    return snap.docs.map(d => d.data() as IndicatorProgress)
  } catch (err) {
    console.warn('listAllIndicatorProgress: Firestore unavailable', err)
    return []
  }
}

export async function addIndicatorProgress(
  indicatorId: string,
  quarter: Quarter,
  value: number,
  notes: string
): Promise<IndicatorProgress> {
  const id = `indprog_${indicatorId}_${quarter}`
  const entry: IndicatorProgress = {
    id,
    indicatorId,
    quarter,
    value,
    recordedAt: new Date().toISOString(),
    notes,
  }
  await setDoc(doc(db, IND_PROGRESS_COL, id), entry)
  return entry
}
