/**
 * VCAP2 File Manager – Default folder structure setup.
 *
 * Creates a well-organised folder hierarchy for CCA and MPA documents
 * the first time a user accesses the File Manager.
 */
import { db } from '../config/firebase'
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'

const FOLDERS_COL = 'fm_folders'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ─── Folder tree definition ──────────────────────────────────

export interface FolderNode {
  name: string
  children?: FolderNode[]
}

/**
 * Default VCAP2 folder structure organised by CCA / MPA document categories.
 * Derived from actual project correspondence & deliverables.
 */
export const VCAP2_DEFAULT_FOLDERS: FolderNode[] = [
  {
    name: '01 - CCA (Community Conservation Areas)',
    children: [
      { name: 'Application Forms' },
      { name: 'Management Plans' },
      { name: 'METT Assessments' },
      { name: 'Community Profiles' },
      { name: 'Shapefiles & Maps' },
      { name: 'Site Reports' },
    ],
  },
  {
    name: '02 - MPA (Marine Protected Areas)',
    children: [
      { name: 'TOR Documents' },
      { name: 'Boundary Records' },
      { name: 'Management Plans' },
      { name: 'Site Reports' },
      { name: 'Conflict Resolution' },
    ],
  },
  {
    name: '03 - Progress Reports',
    children: [
      { name: 'Quarterly Reports' },
      { name: 'Annual Reports' },
      { name: 'Component Reports' },
    ],
  },
  {
    name: '04 - Assessment Reports',
    children: [
      { name: 'Baseline Surveys' },
      { name: 'Stock Assessments' },
      { name: 'METT Assessments' },
      { name: 'Environmental Surveys' },
    ],
  },
  {
    name: '05 - Meeting Minutes',
    children: [
      { name: 'Staff Meetings' },
      { name: 'Stakeholder Meetings' },
      { name: 'Project Board Meetings' },
    ],
  },
  {
    name: '06 - Training & Capacity Building',
    children: [
      { name: 'Training Materials' },
      { name: 'Workshop Documents' },
      { name: 'Proposals' },
    ],
  },
  {
    name: '07 - GIS Data & Maps',
    children: [
      { name: 'Shapefiles' },
      { name: 'Final Maps' },
      { name: 'Field Data' },
    ],
  },
  {
    name: '08 - Communications & Media',
    children: [
      { name: 'Radio & Media' },
      { name: 'Outreach Materials' },
      { name: 'Correspondence' },
    ],
  },
  {
    name: '09 - Project Administration',
    children: [
      { name: 'TOR Documents' },
      { name: 'Finance & Budget' },
      { name: 'M&E Documents' },
      { name: 'Weekly Updates' },
    ],
  },
]

// ─── Setup logic ─────────────────────────────────────────────

/**
 * Check whether the default folder structure has already been created
 * for a given user (by looking for any root-level folders they own).
 */
export async function hasDefaultFolders(ownerId: string): Promise<boolean> {
  if (!db) return false
  // Single-field query to avoid composite index requirement
  const q = query(
    collection(db, FOLDERS_COL),
    where('ownerId', '==', ownerId),
  )
  const snap = await getDocs(q)
  // Consider setup done if user already has any root folder
  return snap.docs.filter((d) => !d.data()._deleted && d.data().parentId === null).length >= 1
}

/**
 * Recursively create a folder tree in Firestore,
 * skipping any folder that already exists (by name + parentId).
 */
async function createFolderTree(
  nodes: FolderNode[],
  parentId: string | null,
  ownerId: string,
  ownerName: string,
): Promise<number> {
  if (!db) return 0

  // Load existing siblings to avoid duplicates (single-field query to avoid composite index)
  const existingQ = query(
    collection(db, FOLDERS_COL),
    where('ownerId', '==', ownerId),
  )
  const existingAllSnap = await getDocs(existingQ)
  // Filter to matching parentId client-side
  const existingDocs = existingAllSnap.docs.filter((d) => d.data().parentId === parentId)
  const existingNames = new Map<string, string>()
  for (const d of existingDocs) {
    if (!d.data()._deleted) {
      existingNames.set(d.data().name as string, d.id)
    }
  }

  let count = 0
  for (const node of nodes) {
    let folderId = existingNames.get(node.name)
    if (!folderId) {
      folderId = generateId('folder')
      const now = new Date().toISOString()
      await setDoc(doc(db, FOLDERS_COL, folderId), {
        id: folderId,
        name: node.name,
        parentId,
        ownerId,
        ownerName,
        createdAt: now,
        updatedAt: now,
        _ts: serverTimestamp(),
      })
      count++
    }
    if (node.children?.length) {
      count += await createFolderTree(node.children, folderId, ownerId, ownerName)
    }
  }
  return count
}

/**
 * Set up the default VCAP2 folder structure for a user.
 * Safe to call multiple times – skips if folders already exist.
 *
 * @returns the number of folders created, or 0 if already set up.
 */
export async function setupDefaultFolders(
  ownerId: string,
  ownerName: string,
): Promise<number> {
  const alreadyDone = await hasDefaultFolders(ownerId)
  if (alreadyDone) return 0
  return createFolderTree(VCAP2_DEFAULT_FOLDERS, null, ownerId, ownerName)
}
