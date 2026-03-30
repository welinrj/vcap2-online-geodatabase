import { db } from '../config/firebase'
import { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

export interface QuarterlyLog {
  id: string
  year: number
  quarter: 1 | 2 | 3 | 4
  /** Headline narrative for the quarter */
  summary: string
  /** Key achievements this quarter */
  achievements: string
  /** Issues or challenges encountered */
  issues: string
  /** Plans for the next quarter */
  nextSteps: string
  /** ProDoc indicators most relevant to this period */
  indicators: string[]
  /** Total budget spent this quarter (VUV) */
  budgetSpentVUV: number | null
  authorName: string
  createdAt: string
  updatedAt: string
}

const COLLECTION = 'quarterly_logs'

function tsToStr(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

export async function listQuarterlyLogs(): Promise<QuarterlyLog[]> {
  if (!db) {
    try { return JSON.parse(localStorage.getItem('vcap2_quarterly_logs') ?? '[]') } catch { return [] }
  }
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      ...data,
      createdAt: tsToStr(data.createdAt),
      updatedAt: tsToStr(data.updatedAt),
    } as QuarterlyLog
  }).sort((a, b) => b.year - a.year || b.quarter - a.quarter)
}

export async function saveQuarterlyLog(log: QuarterlyLog): Promise<void> {
  if (!db) {
    const all = await listQuarterlyLogs()
    const idx = all.findIndex((l) => l.id === log.id)
    if (idx >= 0) all[idx] = log; else all.push(log)
    localStorage.setItem('vcap2_quarterly_logs', JSON.stringify(all))
    return
  }
  await setDoc(doc(db, COLLECTION, log.id), { ...log, _ts: serverTimestamp() })
}

export async function deleteQuarterlyLog(id: string): Promise<void> {
  if (!db) {
    const all = await listQuarterlyLogs()
    localStorage.setItem('vcap2_quarterly_logs', JSON.stringify(all.filter((l) => l.id !== id)))
    return
  }
  await deleteDoc(doc(db, COLLECTION, id))
}

export function quarterLabel(year: number, quarter: 1 | 2 | 3 | 4): string {
  const months = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec']
  return `Q${quarter} ${year} (${months[quarter - 1]})`
}
