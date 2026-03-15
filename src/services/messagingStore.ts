import { db } from '../config/firebase'
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import type { Conversation, Message, AppNotification } from '../types/messaging'

const CONVERSATIONS_COL = 'conversations'
const MESSAGES_COL = 'messages'
const NOTIFICATIONS_COL = 'notifications'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function tsToString(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

// ─── Conversations ────────────────────────────────

export async function createConversation(
  type: 'direct' | 'group',
  participants: string[],
  participantNames: Record<string, string>,
  createdBy: string,
  name?: string,
): Promise<Conversation> {
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('conv')
  const now = new Date().toISOString()
  const conv: Conversation = {
    id,
    type,
    name,
    participants,
    participantNames,
    createdBy,
    createdAt: now,
  }
  await setDoc(doc(db, CONVERSATIONS_COL, id), { ...conv, _ts: serverTimestamp() })
  return conv
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  if (!db) return []
  const q = query(
    collection(db, CONVERSATIONS_COL),
    where('participants', 'array-contains', userId),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        ...data,
        createdAt: tsToString(data.createdAt),
        lastMessageAt: data.lastMessageAt ? tsToString(data.lastMessageAt) : undefined,
      } as Conversation
    })
    .sort((a, b) => {
      const ta = a.lastMessageAt || a.createdAt
      const tb = b.lastMessageAt || b.createdAt
      return tb.localeCompare(ta)
    })
}

/** Find existing direct conversation between two users */
export async function findDirectConversation(
  userId1: string,
  userId2: string,
): Promise<Conversation | null> {
  if (!db) return null
  const q = query(
    collection(db, CONVERSATIONS_COL),
    where('type', '==', 'direct'),
    where('participants', 'array-contains', userId1),
  )
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    const data = d.data() as Conversation
    if (data.participants.includes(userId2) && data.participants.length === 2) {
      return { ...data, createdAt: tsToString((d.data() as Record<string, unknown>).createdAt) }
    }
  }
  return null
}

/** Subscribe to conversation list changes */
export function onConversationsChanged(
  userId: string,
  callback: (convs: Conversation[]) => void,
): () => void {
  if (!db) return () => {}
  const q = query(
    collection(db, CONVERSATIONS_COL),
    where('participants', 'array-contains', userId),
  )
  return onSnapshot(q, (snap) => {
    const convs = snap.docs
      .map((d) => {
        const data = d.data()
        return {
          ...data,
          createdAt: tsToString(data.createdAt),
          lastMessageAt: data.lastMessageAt ? tsToString(data.lastMessageAt) : undefined,
        } as Conversation
      })
      .sort((a, b) => {
        const ta = a.lastMessageAt || a.createdAt
        const tb = b.lastMessageAt || b.createdAt
        return tb.localeCompare(ta)
      })
    callback(convs)
  })
}

export async function deleteConversation(convId: string): Promise<void> {
  if (!db) return
  // Delete all messages
  const msgQ = query(collection(db, MESSAGES_COL), where('conversationId', '==', convId))
  const msgSnap = await getDocs(msgQ)
  for (const d of msgSnap.docs) await deleteDoc(d.ref)
  await deleteDoc(doc(db, CONVERSATIONS_COL, convId))
}

// ─── Messages ─────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderName: string,
  text?: string,
  attachment?: { name: string; data: string; mimeType: string; size: number },
): Promise<Message> {
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('msg')
  const now = new Date().toISOString()
  const msg: Message = {
    id,
    conversationId,
    senderId,
    senderName,
    text,
    attachmentName: attachment?.name,
    attachmentData: attachment?.data,
    attachmentMimeType: attachment?.mimeType,
    attachmentSize: attachment?.size,
    createdAt: now,
  }
  await setDoc(doc(db, MESSAGES_COL, id), { ...msg, _ts: serverTimestamp() })
  // Update conversation with last message preview
  const preview = attachment ? `Sent ${attachment.name}` : (text || '')
  await setDoc(
    doc(db, CONVERSATIONS_COL, conversationId),
    { lastMessage: preview.slice(0, 100), lastMessageAt: now, lastMessageBy: senderId },
    { merge: true },
  )
  return msg
}

export async function listMessages(
  conversationId: string,
  messageLimit = 100,
): Promise<Message[]> {
  if (!db) return []
  const q = query(
    collection(db, MESSAGES_COL),
    where('conversationId', '==', conversationId),
    orderBy('createdAt', 'desc'),
    fbLimit(messageLimit),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt) } as Message
    })
    .reverse()
}

/** Subscribe to new messages in a conversation */
export function onMessagesChanged(
  conversationId: string,
  callback: (msgs: Message[]) => void,
): () => void {
  if (!db) return () => {}
  const q = query(
    collection(db, MESSAGES_COL),
    where('conversationId', '==', conversationId),
    orderBy('createdAt', 'desc'),
    fbLimit(100),
  )
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs
      .map((d) => {
        const data = d.data()
        return { ...data, createdAt: tsToString(data.createdAt) } as Message
      })
      .reverse()
    callback(msgs)
  })
}

// ─── Notifications ────────────────────────────────

export async function createNotification(
  notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
): Promise<AppNotification> {
  if (!db) throw new Error('Firestore not configured')
  const id = generateId('notif')
  const now = new Date().toISOString()
  const notif: AppNotification = { ...notification, id, read: false, createdAt: now }
  await setDoc(doc(db, NOTIFICATIONS_COL, id), { ...notif, _ts: serverTimestamp() })
  return notif
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  if (!db) return []
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    fbLimit(50),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return { ...data, createdAt: tsToString(data.createdAt) } as AppNotification
  })
}

export function onNotificationsChanged(
  userId: string,
  callback: (notifs: AppNotification[]) => void,
): () => void {
  if (!db) return () => {}
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    fbLimit(50),
  )
  return onSnapshot(q, (snap) => {
    const notifs = snap.docs.map((d) => {
      const data = d.data()
      return { ...data, createdAt: tsToString(data.createdAt) } as AppNotification
    })
    callback(notifs)
  })
}

export async function markNotificationRead(notifId: string): Promise<void> {
  if (!db) return
  await setDoc(doc(db, NOTIFICATIONS_COL, notifId), { read: true }, { merge: true })
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!db) return
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', userId),
    where('read', '==', false),
  )
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    await setDoc(d.ref, { read: true }, { merge: true })
  }
}

export async function deleteNotification(notifId: string): Promise<void> {
  if (!db) return
  await deleteDoc(doc(db, NOTIFICATIONS_COL, notifId))
}
