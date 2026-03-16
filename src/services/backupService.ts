/**
 * Backup & Restore Service
 *
 * Provides full portal data export/import for disaster recovery.
 * Exports all collections to a single JSON file that can be downloaded.
 */

import { db } from './firebase'
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { logAudit } from './auditLog'

interface BackupManifest {
  version: 2
  exportedAt: string
  collections: Record<string, Record<string, unknown>[]>
}

const BACKUP_COLLECTIONS = [
  'datasets',
  'dataset_metadata',
  'protectedAreas',
  'portal_categories',
  'portal_config',
  'prodoc-tracker',
  'prodocs',
  'nbsap_targets',
  'activities',
  'fm_folders',
  'fm_files',
  'fm_shares',
  'users',
]

/** Export all portal data as a downloadable JSON backup */
export async function exportFullBackup(): Promise<void> {
  if (!db) throw new Error('Firestore not configured')

  const manifest: BackupManifest = {
    version: 2,
    exportedAt: new Date().toISOString(),
    collections: {},
  }

  for (const colName of BACKUP_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName))
      manifest.collections[colName] = snap.docs.map((d) => ({
        _id: d.id,
        ...d.data(),
      }))
    } catch {
      // Collection may not exist yet — skip
      manifest.collections[colName] = []
    }
  }

  // Also export dataset chunks
  try {
    const datasetsSnap = await getDocs(collection(db, 'datasets'))
    const chunks: Record<string, unknown>[] = []
    for (const dsDoc of datasetsSnap.docs) {
      const chunksSnap = await getDocs(collection(db, 'datasets', dsDoc.id, 'chunks'))
      for (const chunkDoc of chunksSnap.docs) {
        chunks.push({
          _id: chunkDoc.id,
          _parentId: dsDoc.id,
          ...chunkDoc.data(),
        })
      }
    }
    manifest.collections['_dataset_chunks'] = chunks
  } catch {
    manifest.collections['_dataset_chunks'] = []
  }

  const json = JSON.stringify(manifest, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `vcap2-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  } finally {
    URL.revokeObjectURL(url)
  }

  await logAudit(
    'backup_export',
    'system',
    'full_backup',
    `Full backup (${Object.values(manifest.collections).reduce((s, c) => s + c.length, 0)} documents)`,
  )
}

/** Import data from a backup file, skipping documents that already exist */
export async function importBackup(
  file: File,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  if (!db) throw new Error('Firestore not configured')

  const text = await file.text()
  const manifest: BackupManifest = JSON.parse(text)

  if (!manifest.version || !manifest.collections) {
    throw new Error('Invalid backup file format')
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const [colName, docs] of Object.entries(manifest.collections)) {
    if (colName === '_dataset_chunks') continue // Handle separately

    for (const docData of docs) {
      const { _id, ...data } = docData as Record<string, unknown> & { _id: string }
      if (!_id) continue

      try {
        const ref = doc(db, colName, _id)
        const existing = await getDoc(ref)
        if (existing.exists()) {
          skipped++
          continue
        }
        await setDoc(ref, data)
        imported++
      } catch (err) {
        errors.push(`${colName}/${_id}: ${err}`)
      }
    }
  }

  // Import dataset chunks
  const chunks = manifest.collections['_dataset_chunks'] ?? []
  for (const chunkData of chunks) {
    const { _id, _parentId, ...data } = chunkData as Record<string, unknown> & { _id: string; _parentId: string }
    if (!_id || !_parentId) continue

    try {
      const ref = doc(db, 'datasets', _parentId, 'chunks', _id)
      const existing = await getDoc(ref)
      if (existing.exists()) {
        skipped++
        continue
      }
      await setDoc(ref, data)
      imported++
    } catch (err) {
      errors.push(`datasets/${_parentId}/chunks/${_id}: ${err}`)
    }
  }

  await logAudit(
    'backup_import',
    'system',
    'full_import',
    `Imported ${imported} docs, skipped ${skipped}, ${errors.length} errors`,
  )

  return { imported, skipped, errors }
}
