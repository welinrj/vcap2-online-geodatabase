import { db } from '../config/firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

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
  /** Base64-encoded file content (for files under ~1 MB) */
  data: string
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
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileFolder
  })
}

export async function deleteFolder(folderId: string): Promise<void> {
  if (!db) return
  // Delete all files in folder
  const filesQ = query(collection(db, FILES_COL), where('folderId', '==', folderId))
  const filesSnap = await getDocs(filesQ)
  for (const d of filesSnap.docs) await deleteDoc(d.ref)
  // Delete child folders recursively
  const childQ = query(collection(db, FOLDERS_COL), where('parentId', '==', folderId))
  const childSnap = await getDocs(childQ)
  for (const d of childSnap.docs) await deleteFolder(d.id)
  // Delete shares referencing this folder
  const sharesQ = query(collection(db, SHARES_COL), where('itemId', '==', folderId))
  const sharesSnap = await getDocs(sharesQ)
  for (const d of sharesSnap.docs) await deleteDoc(d.ref)
  // Delete the folder itself
  await deleteDoc(doc(db, FOLDERS_COL, folderId))
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
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('file')
  const now = new Date().toISOString()
  const data = await fileToBase64(file)
  const entry: FileEntry = {
    id,
    name: file.name,
    folderId,
    ownerId,
    ownerName,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    data,
    createdAt: now,
    updatedAt: now,
  }
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
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToString(data.createdAt), updatedAt: tsToString(data.updatedAt) } as FileEntry
  })
}

export async function deleteFile(fileId: string): Promise<void> {
  if (!db) return
  // Delete shares referencing this file
  const sharesQ = query(collection(db, SHARES_COL), where('itemId', '==', fileId))
  const sharesSnap = await getDocs(sharesQ)
  for (const d of sharesSnap.docs) await deleteDoc(d.ref)
  await deleteDoc(doc(db, FILES_COL, fileId))
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
}

export function downloadFile(entry: FileEntry): void {
  const link = document.createElement('a')
  link.href = entry.data
  link.download = entry.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
