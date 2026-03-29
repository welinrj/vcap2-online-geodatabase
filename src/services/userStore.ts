import type { UserProfile } from '../types/user'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore'

const COLLECTION = 'users'

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export async function createUser(name: string, avatar: string | null): Promise<UserProfile> {
  const user: UserProfile = {
    id: generateId(),
    name,
    avatar,
    createdAt: new Date().toISOString(),
  }

  await setDoc(doc(db, COLLECTION, user.id), user)
  return user
}

export async function getUser(id: string): Promise<UserProfile | null> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return snapshot.data() as UserProfile
}

export async function updateUser(
  id: string,
  updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>,
): Promise<UserProfile | null> {
  const user = await getUser(id)
  if (!user) return null

  Object.assign(user, updates)
  await setDoc(doc(db, COLLECTION, id), user)
  return user
}

export async function listUsers(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, COLLECTION))
  return snapshot.docs.map((d) => d.data() as UserProfile)
}

export async function findUserByName(name: string): Promise<UserProfile | null> {
  const users = await listUsers()
  return users.find((u) => u.name.toLowerCase() === name.toLowerCase()) ?? null
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  if (!email) return null
  const users = await listUsers()
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

/**
 * Deduplicate users by name — keeps the entry with the most recent login
 * or the one with an email, so duplicate "VCAP2 Staff" entries collapse to one.
 */
export function deduplicateUsers(users: UserProfile[]): UserProfile[] {
  const byName = new Map<string, UserProfile>()
  for (const u of users) {
    const key = u.name.toLowerCase().trim()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, u)
      continue
    }
    // Prefer the entry that has an email, more recent login, or a role set
    const score = (p: UserProfile) =>
      (p.email ? 4 : 0) +
      (p.lastLogin ? 2 : 0) +
      (p.role ? 1 : 0)
    if (score(u) > score(existing)) {
      byName.set(key, u)
    }
  }
  return Array.from(byName.values())
}

export async function deleteUserProfile(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
