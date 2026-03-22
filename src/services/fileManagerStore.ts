import { db, storage, auth } from '../config/firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { logAudit } from './auditLog'

// ─── Types ─────────────────────────────────────────

export interface FileFolder {
  id: string
  name: string
  parentId: string | null
  ownerId: string
  ownerName: string
  createdAt: string
  updatedAt: string
}

export interface FileEntry {
  id: string
  name: string
  folderId: string
  ownerId: string
  ownerName: string
  mimeType: string
  sizeBytes: number
  /** Download URL from Firebase Cloud Storage */
  storageUrl: string
  /** Storage path for deletion */
  storagePath: string
  createdAt: string
  updatedAt: string
}

export interface FileShare {
  id: string
  /** 'folder' or 'file' */
  itemType: 'folder' | 'file'
  itemId: string
  itemName: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  createdAt: string
}

const FOLDERS_COL = 'fm_folders'
const FILES_COL = 'fm_files'
const SHARES_COL = 'fm_shares'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function tsToString(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

// ─── Folders ───────────────────────────────────────

export async function createFolder(
  name: string,
  parentId: string | null,
  ownerId: string,
  ownerName: string,
): Promise<FileFolder> {
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('folder')
  const now = new Date().toISOString()
  const folder: FileFolder = { id, name, parentId, ownerId, ownerName, createdAt: now, updatedAt: now }
  await setDoc(doc(db, FOLDERS_COL, id), { ...folder, _ts: serverTimestamp() })
  return folder
}

export async function listFolders(ownerId: string, parentId: string | null): Promise<FileFolder[]> {
  if (!db) return []
  const q = query(
    collection(db, FOLDERS_COL),
    where('ownerId', '==', ownerId),
    where('parentId', '==', parentId),
  )
  const snap = await getDocs(q)
  return snap.docs
    .filter((d) => !d.data()._deleted)
    .map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileFolder
    })
}

/**
 * Soft-delete a folder and all its contents.
 * Files and subfolders are marked as deleted but preserved.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  if (!db) return
  const folderSnap = await getDoc(doc(db, FOLDERS_COL, folderId))
  const folderName = folderSnap.exists() ? (folderSnap.data().name as string) : folderId

  // Soft-delete all files in folder
  const filesQ = query(collection(db, FILES_COL), where('folderId', '==', folderId))
  const filesSnap = await getDocs(filesQ)
  for (const d of filesSnap.docs) {
    await updateDoc(d.ref, { _deleted: true, _deletedAt: new Date().toISOString() })
  }
  // Soft-delete child folders recursively
  const childQ = query(collection(db, FOLDERS_COL), where('parentId', '==', folderId))
  const childSnap = await getDocs(childQ)
  for (const d of childSnap.docs) await deleteFolder(d.id)
  // Soft-delete the folder itself
  await updateDoc(doc(db, FOLDERS_COL, folderId), {
    _deleted: true,
    _deletedAt: new Date().toISOString(),
  })

  await logAudit('soft_delete', 'folder', folderId, folderName, `${filesSnap.size} files, ${childSnap.size} subfolders`)
}

export async function renameFolder(folderId: string, newName: string): Promise<void> {
  if (!db) return
  const ref = doc(db, FOLDERS_COL, folderId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  await setDoc(ref, { ...snap.data(), name: newName, updatedAt: new Date().toISOString() })
}

// ─── Files ─────────────────────────────────────────

export async function uploadFile(
  file: File,
  folderId: string,
  ownerId: string,
  ownerName: string,
): Promise<FileEntry> {
  if (!db || !storage) throw new Error('Firebase not configured')

  // Use the current Firebase Auth UID for the storage path
  // Storage rules require request.auth.uid == userId in the path
  const authUid = auth.currentUser?.uid
  if (!authUid) {
    throw new Error('You must be signed in to upload files. Please log out and log back in.')
  }

  const id = generateId('file')
  const now = new Date().toISOString()

  // Upload file to Firebase Cloud Storage using auth UID in path
  const storagePath = `fm-files/${authUid}/${id}/${file.name}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  })
  const storageUrl = await getDownloadURL(storageRef)

  const entry: FileEntry = {
    id,
    name: file.name,
    folderId,
    ownerId,
    ownerName,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storageUrl,
    storagePath,
    createdAt: now,
    updatedAt: now,
  }
  // Store metadata only in Firestore (no file content)
  await setDoc(doc(db, FILES_COL, id), { ...entry, _ts: serverTimestamp() })
  return entry
}

export async function listFiles(folderId: string, ownerId: string): Promise<FileEntry[]> {
  if (!db) return []
  const q = query(
    collection(db, FILES_COL),
    where('folderId', '==', folderId),
    where('ownerId', '==', ownerId),
  )
  const snap = await getDocs(q)
  return snap.docs
    .filter((d) => !d.data()._deleted)
    .map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileEntry
    })
}

/**
 * Soft-delete a file. Metadata is preserved; storage file is kept until hard-delete.
 */
export async function deleteFile(fileId: string): Promise<void> {
  if (!db) return
  const fileSnap = await getDoc(doc(db, FILES_COL, fileId))
  const fileName = fileSnap.exists() ? (fileSnap.data().name as string) : fileId

  await updateDoc(doc(db, FILES_COL, fileId), {
    _deleted: true,
    _deletedAt: new Date().toISOString(),
  })

  await logAudit('soft_delete', 'file', fileId, fileName)
}

/**
 * Permanently delete a file from both Firestore and Cloud Storage.
 */
export async function hardDeleteFile(fileId: string): Promise<void> {
  if (!db) return
  const fileSnap = await getDoc(doc(db, FILES_COL, fileId))
  if (fileSnap.exists()) {
    const data = fileSnap.data()
    // Delete from Cloud Storage if path exists
    if (data.storagePath && storage) {
      try {
        await deleteObject(ref(storage, data.storagePath))
      } catch {
        // Storage file may already be deleted
      }
    }
  }
  await deleteDoc(doc(db, FILES_COL, fileId))
}

/** Restore a soft-deleted file */
export async function restoreFile(fileId: string): Promise<void> {
  if (!db) return
  await updateDoc(doc(db, FILES_COL, fileId), {
    _deleted: false,
    _deletedAt: '',
  })
  await logAudit('restore', 'file', fileId, fileId)
}

/** Restore a soft-deleted folder and its contents */
export async function restoreFolder(folderId: string): Promise<void> {
  if (!db) return
  // Restore files in folder
  const filesQ = query(collection(db, FILES_COL), where('folderId', '==', folderId), where('_deleted', '==', true))
  const filesSnap = await getDocs(filesQ)
  for (const d of filesSnap.docs) {
    await updateDoc(d.ref, { _deleted: false, _deletedAt: '' })
  }
  // Restore child folders recursively
  const childQ = query(collection(db, FOLDERS_COL), where('parentId', '==', folderId), where('_deleted', '==', true))
  const childSnap = await getDocs(childQ)
  for (const d of childSnap.docs) await restoreFolder(d.id)
  // Restore the folder itself
  await updateDoc(doc(db, FOLDERS_COL, folderId), { _deleted: false, _deletedAt: '' })
  await logAudit('restore', 'folder', folderId, folderId)
}

/** List all soft-deleted files and folders (trash) */
export async function listTrash(ownerId: string): Promise<{ files: FileEntry[]; folders: FileFolder[] }> {
  if (!db) return { files: [], folders: [] }
  const filesQ = query(collection(db, FILES_COL), where('ownerId', '==', ownerId), where('_deleted', '==', true))
  const foldersQ = query(collection(db, FOLDERS_COL), where('ownerId', '==', ownerId), where('_deleted', '==', true))
  const [filesSnap, foldersSnap] = await Promise.all([getDocs(filesQ), getDocs(foldersQ)])
  return {
    files: filesSnap.docs.map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileEntry
    }),
    folders: foldersSnap.docs.map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileFolder
    }),
  }
}

export async function getFile(fileId: string): Promise<FileEntry | null> {
  if (!db) return null
  const snap = await getDoc(doc(db, FILES_COL, fileId))
  if (!snap.exists()) return null
  const data = snap.data()
  return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileEntry
}

// ─── Sharing ───────────────────────────────────────

export async function shareItem(
  itemType: 'folder' | 'file',
  itemId: string,
  itemName: string,
  fromUserId: string,
  fromUserName: string,
  toUserId: string,
  toUserName: string,
): Promise<FileShare> {
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('share')
  const now = new Date().toISOString()
  const share: FileShare = { id, itemType, itemId, itemName, fromUserId, fromUserName, toUserId, toUserName, createdAt: now }
  await setDoc(doc(db, SHARES_COL, id), { ...share, _ts: serverTimestamp() })
  return share
}

export async function listSharedWithMe(userId: string): Promise<FileShare[]> {
  if (!db) return []
  const q = query(collection(db, SHARES_COL), where('toUserId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToString(data.createdAt) } as FileShare
  })
}

export async function listMyShares(userId: string): Promise<FileShare[]> {
  if (!db) return []
  const q = query(collection(db, SHARES_COL), where('fromUserId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToString(data.createdAt) } as FileShare
  })
}

export async function deleteShare(shareId: string): Promise<void> {
  if (!db) return
  await deleteDoc(doc(db, SHARES_COL, shareId))
}

// ─── Helpers ───────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
}

/**
 * Download a file from Cloud Storage via its URL.
 * Falls back to opening in a new tab if fetch fails (CORS).
 */
export async function downloadFile(entry: FileEntry): Promise<void> {
  // Support legacy base64 entries (data field) and new storage URL entries
  const url = entry.storageUrl || (entry as unknown as Record<string, unknown>).data as string | undefined
  if (!url) return

  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = entry.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank')
  }
}
