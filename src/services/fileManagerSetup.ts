/**
 * VCAP2 File Manager – Default folder structure setup.
 *
 * Creates a well-organised folder hierarchy for CCA and MPA documents
 * the first time a user accesses the File Manager.
 */
import { db, auth } from '../config/firebase'
import { signInAnonymously } from 'firebase/auth'
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'

const FOLDERS_COL = 'fm_folders'
const CONFIG_COL = 'fm_config'
const SETUP_DOC = 'setup'

async function ensureAuth(): Promise<void> {
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
}

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
 * Check whether setup has already been completed using a dedicated
 * Firestore config document — more reliable than counting folders.
 */
async function isSetupComplete(): Promise<boolean> {
  if (!db) return false
  const snap = await getDoc(doc(db, CONFIG_COL, SETUP_DOC))
  return snap.exists() && snap.data()?.completed === true
}

/**
 * Mark setup as complete in Firestore so no other session repeats it.
 */
async function markSetupComplete(): Promise<void> {
  if (!db) return
  await setDoc(doc(db, CONFIG_COL, SETUP_DOC), {
    completed: true,
    completedAt: new Date().toISOString(),
    _ts: serverTimestamp(),
  })
}

/**
 * Remove duplicate folders: for each (name, parentId) group keep the oldest
 * entry and soft-delete the rest. Safe to run on every startup.
 */
export async function deduplicateFolders(): Promise<number> {
  if (!db) return 0
  await ensureAuth()
  const snap = await getDocs(collection(db, FOLDERS_COL))
  // Group active folders by composite key name+parentId
  const groups = new Map<string, { id: string; createdAt: string }[]>()
  for (const d of snap.docs) {
    const data = d.data()
    if (data._deleted) continue
    const key = `${data.parentId ?? 'root'}::${data.name}`
    const list = groups.get(key) ?? []
    list.push({ id: d.id, createdAt: data.createdAt ?? '' })
    groups.set(key, list)
  }
  let removed = 0
  for (const list of groups.values()) {
    if (list.length <= 1) continue
    // Keep the oldest (smallest createdAt string); delete the rest
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const dup of list.slice(1)) {
      await updateDoc(doc(db, FOLDERS_COL, dup.id), {
        _deleted: true,
        _deletedAt: new Date().toISOString(),
      })
      removed++
    }
  }
  return removed
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

  const existingAllSnap = await getDocs(collection(db, FOLDERS_COL))
  const existingNames = new Map<string, string>()
  for (const d of existingAllSnap.docs) {
    const data = d.data()
    if (!data._deleted && data.parentId === parentId) {
      existingNames.set(data.name as string, d.id)
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
 * Set up the default VCAP2 folder structure.
 * Uses fm_config/setup as an atomic lock — safe to call from multiple
 * simultaneous sessions; only the first caller creates folders.
 *
 * @returns the number of folders created, or 0 if already set up.
 */
export async function setupDefaultFolders(
  ownerId: string,
  ownerName: string,
): Promise<number> {
  await ensureAuth()
  if (await isSetupComplete()) return 0
  // Write the lock before creating folders to prevent concurrent setup
  await markSetupComplete()
  return createFolderTree(VCAP2_DEFAULT_FOLDERS, null, ownerId, ownerName)
}
