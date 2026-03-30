import { db } from '../config/firebase'
import { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

export type RiskStatus = 'open' | 'mitigated' | 'closed' | 'escalated'
export type RiskCategory = 'financial' | 'operational' | 'environmental' | 'political' | 'technical' | 'other'

export interface Risk {
  id: string
  title: string
  description: string
  category: RiskCategory
  /** 1–5 */
  likelihood: number
  /** 1–5 */
  impact: number
  /** Computed: likelihood × impact */
  score: number
  mitigation: string
  owner: string
  status: RiskStatus
  reviewDate: string
  createdAt: string
  updatedAt: string
}

export const RISK_CATEGORIES: Record<RiskCategory, string> = {
  financial: 'Financial', operational: 'Operational', environmental: 'Environmental',
  political: 'Political / Governance', technical: 'Technical', other: 'Other',
}

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: 'Open', mitigated: 'Mitigated', closed: 'Closed', escalated: 'Escalated',
}

export function riskLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 15) return 'high'
  if (score >= 8)  return 'medium'
  return 'low'
}

const COLLECTION = 'risks'

function tsToStr(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

export async function listRisks(): Promise<Risk[]> {
  if (!db) {
    try { return JSON.parse(localStorage.getItem('vcap2_risks') ?? '[]') } catch { return [] }
  }
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToStr(data.createdAt), updatedAt: tsToStr(data.updatedAt) } as Risk
  }).sort((a, b) => b.score - a.score)
}

export async function saveRisk(risk: Risk): Promise<void> {
  if (!db) {
    const all = await listRisks()
    const idx = all.findIndex((r) => r.id === risk.id)
    if (idx >= 0) all[idx] = risk; else all.push(risk)
    localStorage.setItem('vcap2_risks', JSON.stringify(all))
    return
  }
  await setDoc(doc(db, COLLECTION, risk.id), { ...risk, _ts: serverTimestamp() })
}

export async function deleteRisk(id: string): Promise<void> {
  if (!db) {
    const all = await listRisks()
    localStorage.setItem('vcap2_risks', JSON.stringify(all.filter((r) => r.id !== id)))
    return
  }
  await deleteDoc(doc(db, COLLECTION, id))
}
