/**
 * Audit Log Service
 *
 * Records all destructive and significant data operations for accountability.
 * Logs are write-once (immutable) — see Firestore rules.
 */

import { db } from './firebase'
import { auth } from '../config/firebase'
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'

export type AuditAction =
  | 'delete'
  | 'soft_delete'
  | 'restore'
  | 'update'
  | 'create'
  | 'bulk_delete'
  | 'purge'
  | 'backup_export'
  | 'backup_import'

export interface AuditEntry {
  id?: string
  action: AuditAction
  /** Collection/resource type: 'dataset', 'protectedArea', 'file', 'folder', 'category', etc. */
  resourceType: string
  /** ID of the affected resource */
  resourceId: string
  /** Human-readable name of the resource */
  resourceName: string
  /** Additional context (e.g. reason, old values) */
  details?: string
  /** Firebase Auth UID */
  userId: string
  /** Display name of the user */
  userName: string
  /** ISO timestamp */
  timestamp: string
}

const COLLECTION = 'audit_logs'

/** Get the current user info from Firebase Auth */
function getCurrentUser(): { userId: string; userName: string } {
  try {
    const user = auth?.currentUser
    if (user) {
      return {
        userId: user.uid,
        userName: user.displayName || user.email || 'Unknown',
      }
    }
  } catch {
    // ignore
  }
  return { userId: 'unknown', userName: 'Unknown' }
}

/** Record an audit log entry */
export async function logAudit(
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  details?: string,
): Promise<void> {
  if (!db) return
  try {
    const user = getCurrentUser()
    await addDoc(collection(db, COLLECTION), {
      action,
      resourceType,
      resourceId,
      resourceName,
      details: details ?? '',
      userId: user.userId,
      userName: user.userName,
      timestamp: new Date().toISOString(),
      _ts: serverTimestamp(),
    })
  } catch (err) {
    // Audit logging should never block the main operation
    console.warn('Failed to write audit log:', err)
  }
}

/** Fetch recent audit log entries */
export async function getRecentAuditLogs(count = 50): Promise<AuditEntry[]> {
  if (!db) return []
  const q = query(collection(db, COLLECTION), orderBy('_ts', 'desc'), limit(count))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      resourceName: data.resourceName,
      details: data.details,
      userId: data.userId,
      userName: data.userName,
      timestamp: data.timestamp,
    } as AuditEntry
  })
}
