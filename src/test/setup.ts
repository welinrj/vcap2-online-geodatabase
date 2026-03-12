import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

// ── In-memory Firestore mock ──
// Provides a Map-backed mock for firebase/firestore so tests run without network.

const store = new Map<string, Record<string, unknown>>()

// Mock doc reference — supports both doc(db, coll, id) and doc(db, coll, id, subcoll, subId)
function mockDoc(_db: unknown, ...segments: string[]) {
  const fullPath = segments.join('/')
  // collectionPath = all but last segment, docId = last segment
  const parts = fullPath.split('/')
  const docId = parts[parts.length - 1]
  const collectionPath = parts.slice(0, -1).join('/')
  return { __type: 'docRef', collectionPath, docId, fullPath, ref: { collectionPath, docId, fullPath } }
}

// Mock collection reference — supports subcollections: collection(db, coll, id, subcoll)
function mockCollection(_db: unknown, ...segments: string[]) {
  const collectionPath = segments.join('/')
  return { __type: 'collectionRef', collectionPath }
}

// Mock query — returns the collection ref unchanged (ordering is done in-memory)
function mockQuery(collectionRef: { __type: string; collectionPath: string }) {
  return collectionRef
}

// Mock orderBy — no-op for tests
function mockOrderBy() {
  return {}
}

async function mockSetDoc(
  ref: { collectionPath: string; docId: string },
  data: Record<string, unknown>,
) {
  store.set(`${ref.collectionPath}/${ref.docId}`, { ...data })
}

async function mockGetDoc(ref: { collectionPath: string; docId: string }) {
  const path = `${ref.collectionPath}/${ref.docId}`
  const data = store.get(path)
  return {
    exists: () => data != null,
    data: () => data ?? null,
  }
}

async function mockGetDocs(ref: { collectionPath: string }) {
  const prefix = ref.collectionPath + '/'
  const docs: Array<{ id: string; data: () => Record<string, unknown>; ref: { collectionPath: string; docId: string; fullPath: string } }> = []
  for (const [key, value] of store.entries()) {
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
      const docId = key.slice(prefix.length)
      docs.push({
        id: docId,
        data: () => value,
        ref: { collectionPath: ref.collectionPath, docId, fullPath: key },
      })
    }
  }
  return { docs, empty: docs.length === 0 }
}

async function mockUpdateDoc(
  ref: { collectionPath: string; docId: string },
  updates: Record<string, unknown>,
) {
  const path = `${ref.collectionPath}/${ref.docId}`
  const existing = store.get(path)
  if (existing) {
    store.set(path, { ...existing, ...updates })
  }
}

async function mockDeleteDoc(ref: { collectionPath: string; docId: string }) {
  store.delete(`${ref.collectionPath}/${ref.docId}`)
}

// Mock writeBatch
function mockWriteBatch() {
  const ops: Array<() => void> = []
  return {
    set(ref: { collectionPath: string; docId: string }, data: Record<string, unknown>) {
      ops.push(() => store.set(`${ref.collectionPath}/${ref.docId}`, { ...data }))
    },
    delete(ref: { collectionPath: string; docId: string }) {
      ops.push(() => store.delete(`${ref.collectionPath}/${ref.docId}`))
    },
    async commit() {
      for (const op of ops) op()
    },
  }
}

// Reset store between tests
beforeEach(() => {
  store.clear()
})

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  enableMultiTabIndexedDbPersistence: () => Promise.resolve(),
  collection: mockCollection,
  doc: mockDoc,
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  writeBatch: mockWriteBatch,
  query: mockQuery,
  orderBy: mockOrderBy,
  onSnapshot: (_query: { collectionPath: string }, callback: (snapshot: { docs: Array<{ data: () => Record<string, unknown> }> }) => void) => {
    // Fire once immediately with current data for tests
    const prefix = _query.collectionPath + '/'
    const docs: Array<{ data: () => Record<string, unknown> }> = []
    for (const [key, value] of store.entries()) {
      if (key.startsWith(prefix)) {
        docs.push({ data: () => value })
      }
    }
    callback({ docs })
    // Return unsubscribe function
    return () => {}
  },
}))
