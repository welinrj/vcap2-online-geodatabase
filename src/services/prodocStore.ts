import type { ProDocEntry } from '../data/prodocTrackerData'
import { newAreas as defaultNewAreas, existingAreas as defaultExistingAreas } from '../data/prodocTrackerData'
import { db } from './firebase'
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore'

/** Firestore document structure for ProDoc Tracker */
interface ProDocDocument {
  newAreas: ProDocEntry[]
  existingAreas: ProDocEntry[]
  columns: ColumnDef[]
  updatedAt: string
}

export interface ColumnDef {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  builtin: boolean
}

const DOC_PATH = 'prodoc-tracker'
const DOC_ID = 'main'

/** Load ProDoc data from Firestore. Returns null if no saved data exists. */
export async function loadProDocData(): Promise<ProDocDocument | null> {
  const ref = doc(db, DOC_PATH, DOC_ID)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return snapshot.data() as ProDocDocument
}

/** Save ProDoc data to Firestore */
export async function saveProDocData(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
  columns: ColumnDef[],
): Promise<void> {
  const ref = doc(db, DOC_PATH, DOC_ID)
  const data: ProDocDocument = {
    newAreas,
    existingAreas,
    columns,
    updatedAt: new Date().toISOString(),
  }
  await setDoc(ref, data)
}

/** Get default data (used when Firestore has no saved data) */
export function getDefaultData() {
  return {
    newAreas: [...defaultNewAreas],
    existingAreas: [...defaultExistingAreas],
  }
}
