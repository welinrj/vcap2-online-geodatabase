import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import type { PortalCategory } from '../types/geospatial'

const COLLECTION = 'portal_categories'

/** Default categories seeded on first use */
const DEFAULT_CATEGORIES: Omit<PortalCategory, 'datasetCount'>[] = [
  {
    id: 'biodiversity',
    name: 'Biodiversity & Species',
    description: 'Species surveys, habitat mapping, and ecological assessments',
    icon: 'TreePine',
    color: '#22c55e',
    sortOrder: 1,
  },
  {
    id: 'marine',
    name: 'Marine & Coastal',
    description: 'Coral reefs, mangroves, seagrass, and coastal zone mapping',
    icon: 'Waves',
    color: '#3b82f6',
    sortOrder: 2,
  },
  {
    id: 'climate',
    name: 'Climate & Resilience',
    description: 'Climate vulnerability, adaptation plans, and resilience assessments',
    icon: 'Thermometer',
    color: '#f59e0b',
    sortOrder: 3,
  },
  {
    id: 'community',
    name: 'Community & Livelihoods',
    description: 'Community boundaries, resource use areas, and livelihood zones',
    icon: 'Users',
    color: '#a855f7',
    sortOrder: 4,
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure & Admin',
    description: 'Roads, settlements, administrative boundaries, and facilities',
    icon: 'Building2',
    color: '#64748b',
    sortOrder: 5,
  },
]

function docToCategory(id: string, data: Record<string, unknown>): PortalCategory {
  return {
    id,
    name: (data.name as string) ?? '',
    description: (data.description as string) ?? '',
    icon: (data.icon as string) ?? 'Folder',
    color: (data.color as string) ?? '#64748b',
    sortOrder: (data.sortOrder as number) ?? 99,
  }
}

/** List all portal categories ordered by sortOrder */
export async function listCategories(): Promise<PortalCategory[]> {
  if (!db) return []
  const q = query(collection(db, COLLECTION), orderBy('sortOrder', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => docToCategory(d.id, d.data()))
}

/** Get a single category by ID */
export async function getCategory(id: string): Promise<PortalCategory | null> {
  if (!db) return null
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return docToCategory(snap.id, snap.data())
}

/** Create or update a category */
export async function saveCategory(cat: PortalCategory): Promise<void> {
  if (!db) return
  const { id, datasetCount: _dc, ...data } = cat
  await setDoc(doc(db, COLLECTION, id), data)
}

/** Delete a category */
export async function deleteCategory(id: string): Promise<void> {
  if (!db) return
  await deleteDoc(doc(db, COLLECTION, id))
}

/** Real-time listener for categories */
export function onCategoriesChanged(
  callback: (categories: PortalCategory[]) => void,
): () => void {
  if (!db) return () => {}
  const q = query(collection(db, COLLECTION), orderBy('sortOrder', 'asc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => docToCategory(d.id, d.data())))
  }, (err) => {
    console.warn('Failed to listen on portal_categories:', err)
  })
}

/**
 * Seed default categories if the collection is empty.
 * Called once from the Dashboard on first load.
 */
export async function seedDefaultCategories(): Promise<PortalCategory[]> {
  if (!db) return []
  const existing = await listCategories()
  if (existing.length > 0) return existing

  for (const cat of DEFAULT_CATEGORIES) {
    await setDoc(doc(db, COLLECTION, cat.id), {
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      color: cat.color,
      sortOrder: cat.sortOrder,
    })
  }
  return DEFAULT_CATEGORIES.map((c) => ({ ...c }))
}
