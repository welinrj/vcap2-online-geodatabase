/**
 * Firebase Authentication Service
 *
 * Provides authentication functions for the VCAP2 app including:
 * - Email/password authentication
 * - Google OAuth
 * - User profile management
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  deleteUser,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth, db } from '../config/firebase'
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import type { UserProfile, UserRole } from '../types/user'

/**
 * Ensure an anonymous Firebase Auth session exists and write a user doc at
 * the anonymous UID so Firestore role-based security rules resolve correctly.
 * No-ops if auth is absent or the user is already signed in. All errors are non-fatal.
 */
export async function ensureAnonymousAuthWithUserDoc(
  role: UserRole,
  name: string,
): Promise<void> {
  if (!auth || auth.currentUser) return
  try {
    const result = await signInAnonymously(auth)
    try {
      await setDoc(doc(db!, 'users', result.user.uid), {
        role,
        name,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }
}

/**
 * Check if Firebase is configured
 */
function ensureFirebaseConfigured(): void {
  if (!auth || !db) {
    throw new Error('Firebase is not configured. Please set up Firebase credentials in your .env file.')
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<UserProfile> {
  ensureFirebaseConfigured()
  const userCredential = await signInWithEmailAndPassword(auth!, email, password)
  const user = userCredential.user

  let profile = await getUserProfile(user.uid)
  if (!profile) {
    profile = await createUserProfile(user.uid, {
      email: user.email || email,
      name: user.displayName || email.split('@')[0],
      role: 'editor',
      organization: '',
    })
  }
  return profile
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle(): Promise<UserProfile> {
  ensureFirebaseConfigured()
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth!, provider)
  const user = result.user

  // Check if user profile exists, create if not
  let profile = await getUserProfile(user.uid)
  if (!profile) {
    profile = await createUserProfile(user.uid, {
      email: user.email || '',
      name: user.displayName || 'User',
      role: 'editor', // Default role
      organization: '',
    })
  }

  return profile
}

/**
 * Create new user with email and password
 */
export async function createUser(
  email: string,
  password: string,
  userData: {
    name: string
    role: UserRole
    organization: string
  }
): Promise<UserProfile> {
  ensureFirebaseConfigured()
  const userCredential = await createUserWithEmailAndPassword(auth!, email, password)
  const user = userCredential.user

  // Update display name
  await updateProfile(user, { displayName: userData.name })

  // Create user profile in Firestore
  const profile = await createUserProfile(user.uid, {
    email,
    ...userData,
  })

  return profile
}

/**
 * Create user profile in Firestore
 */
async function createUserProfile(
  uid: string,
  data: {
    email: string
    name: string
    role: UserRole
    organization: string
  }
): Promise<UserProfile> {
  const userProfile: UserProfile = {
    id: uid,
    email: data.email,
    name: data.name,
    role: data.role,
    organization: data.organization,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  }

  await setDoc(doc(db!, 'users', uid), {
    ...userProfile,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  })

  return userProfile
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db!, 'users', uid)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    return null
  }

  const data = docSnap.data()
  return {
    id: uid,
    email: data.email,
    name: data.name,
    role: data.role,
    organization: data.organization,
    createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
    lastLogin: data.lastLogin?.toDate().toISOString() || new Date().toISOString(),
  }
}

/**
 * Update user profile
 */
export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  ensureFirebaseConfigured()
  const docRef = doc(db!, 'users', uid)
  await updateDoc(docRef, { role })
}

export async function deleteUserById(uid: string): Promise<void> {
  ensureFirebaseConfigured()
  const { deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db!, 'users', uid))
}

export async function adminResetPassword(email: string): Promise<void> {
  ensureFirebaseConfigured()
  await sendPasswordResetEmail(auth!, email)
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'name' | 'organization'>>
): Promise<void> {
  ensureFirebaseConfigured()
  const docRef = doc(db!, 'users', uid)
  await updateDoc(docRef, updates)

  // Update auth profile if name changed
  if (updates.name && auth!.currentUser) {
    await updateProfile(auth!.currentUser, { displayName: updates.name })
  }
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(uid: string): Promise<void> {
  ensureFirebaseConfigured()
  const docRef = doc(db!, 'users', uid)
  await updateDoc(docRef, {
    lastLogin: serverTimestamp(),
  })
}

/**
 * Sign out current user
 */
export async function signOutUser(): Promise<void> {
  ensureFirebaseConfigured()
  await signOut(auth!)
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  ensureFirebaseConfigured()
  await sendPasswordResetEmail(auth!, email)
}

/**
 * Update user email
 */
export async function changeEmail(newEmail: string): Promise<void> {
  ensureFirebaseConfigured()
  if (!auth!.currentUser) {
    throw new Error('No user signed in')
  }
  await updateEmail(auth!.currentUser, newEmail)

  // Update Firestore
  await updateDoc(doc(db!, 'users', auth!.currentUser.uid), {
    email: newEmail,
  })
}

/**
 * Update user password
 */
export async function changePassword(newPassword: string): Promise<void> {
  ensureFirebaseConfigured()
  if (!auth!.currentUser) {
    throw new Error('No user signed in')
  }
  await updatePassword(auth!.currentUser, newPassword)
}

/**
 * Delete user account
 */
export async function deleteUserAccount(): Promise<void> {
  ensureFirebaseConfigured()
  if (!auth!.currentUser) {
    throw new Error('No user signed in')
  }
  // Note: Firestore user profile deletion should be handled by Firebase Functions or Admin SDK
  await deleteUser(auth!.currentUser)
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (user: FirebaseUser | null) => void): () => void {
  ensureFirebaseConfigured()
  return onAuthStateChanged(auth!, callback)
}

/**
 * Get current user
 */
export function getCurrentUser(): FirebaseUser | null {
  if (!auth) return null
  return auth.currentUser
}
