import type {
  ProtectedArea,
  ProtectedAreaSummary,
  ProtectedAreaType,
  ProtectedAreaStatus,
  ProtectedAreaAttachment,
} from '../types/protectedArea'
import type { FeatureCollection } from 'geojson'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'

const COLLECTION = 'protectedAreas'

function generateId(): string {
  return `pa_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function toSummary(area: ProtectedArea): ProtectedAreaSummary {
  return {
    id: area.id,
    name: area.name,
    type: area.type,
    status: area.status,
    island: area.island,
    province: area.province,
    areaHa: area.areaHa,
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
  }
}

export async function listProtectedAreas(): Promise<ProtectedAreaSummary[]> {
  const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => toSummary(d.data() as ProtectedArea))
}

/**
 * Subscribe to real-time protected area list updates.
 * Returns an unsubscribe function.
 */
export function onProtectedAreasChanged(
  callback: (areas: ProtectedAreaSummary[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => toSummary(d.data() as ProtectedArea)))
  })
}

export async function getProtectedArea(
  id: string,
): Promise<ProtectedArea | null> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return snapshot.data() as ProtectedArea
}

export async function createProtectedArea(input: {
  name: string
  type: ProtectedAreaType
  status: ProtectedAreaStatus
  description: string
  island: string
  province: string
  areaHa: number | null
  designatedDate: string
  managementAuthority: string
  boundary: FeatureCollection | null
}): Promise<ProtectedArea> {
  const id = generateId()
  const now = new Date().toISOString()

  const area: ProtectedArea = {
    id,
    name: input.name,
    type: input.type,
    status: input.status,
    description: input.description,
    island: input.island,
    province: input.province,
    areaHa: input.areaHa,
    designatedDate: input.designatedDate,
    managementAuthority: input.managementAuthority,
    boundary: input.boundary,
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(doc(db, COLLECTION, id), area)
  return area
}

export async function updateProtectedArea(
  id: string,
  updates: Partial<
    Omit<ProtectedArea, 'id' | 'createdAt' | 'updatedAt' | 'attachments'>
  >,
): Promise<ProtectedArea | null> {
  const area = await getProtectedArea(id)
  if (!area) return null

  Object.assign(area, updates)
  area.updatedAt = new Date().toISOString()

  await setDoc(doc(db, COLLECTION, id), area)
  return area
}

export async function deleteProtectedArea(id: string): Promise<boolean> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return false

  await deleteDoc(ref)
  return true
}

export async function addAttachment(
  areaId: string,
  file: File,
): Promise<ProtectedArea | null> {
  const area = await getProtectedArea(areaId)
  if (!area) return null

  const data = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })

  const attachment: ProtectedAreaAttachment = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    data,
  }

  area.attachments.push(attachment)
  area.updatedAt = new Date().toISOString()

  await setDoc(doc(db, COLLECTION, areaId), area)
  return area
}

export async function removeAttachment(
  areaId: string,
  attachmentId: string,
): Promise<ProtectedArea | null> {
  const area = await getProtectedArea(areaId)
  if (!area) return null

  area.attachments = area.attachments.filter((a) => a.id !== attachmentId)
  area.updatedAt = new Date().toISOString()

  await setDoc(doc(db, COLLECTION, areaId), area)
  return area
}

// ── Sync helpers ──

export async function exportAllAreas(): Promise<ProtectedArea[]> {
  const snapshot = await getDocs(collection(db, COLLECTION))
  return snapshot.docs.map((d) => d.data() as ProtectedArea)
}

export async function importAreas(
  areas: ProtectedArea[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  for (const area of areas) {
    const ref = doc(db, COLLECTION, area.id)
    const existing = await getDoc(ref)

    if (existing.exists()) {
      skipped++
      continue
    }

    await setDoc(ref, area)
    imported++
  }

  return { imported, skipped }
}

export async function updateAreaGitHubSha(
  id: string,
  sha: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return

  await updateDoc(ref, { githubSha: sha })
}

export function downloadAttachment(attachment: ProtectedAreaAttachment): void {
  const a = document.createElement('a')
  a.href = attachment.data
  a.download = attachment.name
  a.click()
}

export function formatArea(ha: number | null): string {
  if (ha == null) return 'N/A'
  if (ha >= 100) return `${ha.toLocaleString()} ha`
  return `${ha.toFixed(1)} ha`
}
