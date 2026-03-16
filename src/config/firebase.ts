/**
 * Firebase Configuration
 *
 * Environment variables should be set in .env file:
 * - VITE_FIREBASE_API_KEY
 * - VITE_FIREBASE_AUTH_DOMAIN
 * - VITE_FIREBASE_PROJECT_ID
 * - VITE_FIREBASE_STORAGE_BUCKET
 * - VITE_FIREBASE_MESSAGING_SENDER_ID
 * - VITE_FIREBASE_APP_ID
 */

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB2OGgiXUUhyt1aKdHsqIaMS3NDN-tZOdU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'vanuatu-nbsap-dashboard-9909a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vanuatu-nbsap-dashboard-9909a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'vanuatu-nbsap-dashboard-9909a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '778670993904',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:778670993904:web:219c671804326d953aed35',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

// Check if Firebase is configured
const isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.projectId

// Initialize Firebase only if configured
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null

// Initialize Firebase services only if app is configured
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const storage = app ? getStorage(app) : null
export const realtimeDb = app ? getDatabase(app) : null

export default app
