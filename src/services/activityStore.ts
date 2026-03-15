import { db } from '../config/firebase'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

// ─── Types ─────────────────────────────────────────

export type ActivityType = 'survey' | 'mapping' | 'consultation' | 'designation' | 'monitoring' | 'training' | 'other'
export type ActivityStatus = 'planned' | 'in-progress' | 'completed' | 'cancelled'
export type ActivityPriority = 'low' | 'medium' | 'high'

export interface Activity {
  id: string
  areaId: string
  areaName: string
  title: string
  description: string
  type: ActivityType
  status: ActivityStatus
  priority: ActivityPriority
  startDate: string
  endDate: string
  createdAt: string
  /** User who created the activity */
  createdBy: string
  createdByName: string
  /** User assigned to the activity (for availability tracking) */
  assignedTo: string
  assignedToName: string
}

export const ACTIVITY_TYPES: Record<ActivityType, string> = {
  survey: 'Field Survey',
  mapping: 'Boundary Mapping',
  consultation: 'Community Consultation',
  designation: 'Formal Designation',
  monitoring: 'Monitoring',
  training: 'Training',
  other: 'Other',
}

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PRIORITY_LABELS: Record<ActivityPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

const COLLECTION = 'activities'

function tsToString(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

// ─── CRUD ──────────────────────────────────────────

export async function listAllActivities(): Promise<Activity[]> {
  if (!db) {
    // Fallback to localStorage for environments without Firebase
    try {
      return JSON.parse(localStorage.getItem('vcap2_activities') ?? '[]')
    } catch {
      return []
    }
  }
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      createdAt: tsToString(data.createdAt),
      createdBy: data.createdBy ?? '',
      createdByName: data.createdByName ?? '',
      assignedTo: data.assignedTo ?? data.createdBy ?? '',
      assignedToName: data.assignedToName ?? data.createdByName ?? '',
    } as Activity
  })
}

export async function saveActivity(activity: Activity): Promise<void> {
  if (!db) {
    // Fallback to localStorage
    const all = await listAllActivities()
    const idx = all.findIndex((a) => a.id === activity.id)
    if (idx >= 0) all[idx] = activity
    else all.push(activity)
    localStorage.setItem('vcap2_activities', JSON.stringify(all))
    return
  }
  await setDoc(doc(db, COLLECTION, activity.id), { ...activity, _ts: serverTimestamp() })
}

export async function deleteActivity(id: string): Promise<void> {
  if (!db) {
    const all = await listAllActivities()
    localStorage.setItem('vcap2_activities', JSON.stringify(all.filter((a) => a.id !== id)))
    return
  }
  await deleteDoc(doc(db, COLLECTION, id))
}

// ─── Helpers ───────────────────────────────────────

/** Get activities that overlap with a given date range */
export function getActivitiesInRange(activities: Activity[], rangeStart: string, rangeEnd: string): Activity[] {
  return activities.filter((a) => {
    if (!a.startDate) return false
    const aStart = a.startDate
    const aEnd = a.endDate || a.startDate
    return aStart <= rangeEnd && aEnd >= rangeStart
  })
}

/** Get activities for a specific date */
export function getActivitiesForDate(activities: Activity[], date: string): Activity[] {
  return activities.filter((a) => {
    if (!a.startDate) return false
    const end = a.endDate || a.startDate
    return a.startDate <= date && end >= date
  })
}

/** Get unique users who have activities */
export function getActiveUsers(activities: Activity[]): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const a of activities) {
    if (a.assignedTo) map.set(a.assignedTo, a.assignedToName)
    else if (a.createdBy) map.set(a.createdBy, a.createdByName)
  }
  return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}
