import type { UserProfile } from '../types/user'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
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
