/**
 * Firebase Realtime Database Service
 *
 * Handles real-time syncing of field data observations
 * Used by Field Collector and Live Dashboard for live updates
 */

import {
  ref,
  set,
  push,
  get,
  onValue,
  off,
  remove,
  update,
  query,
  orderByChild,
  limitToLast,
  DataSnapshot,
} from 'firebase/database'
import { realtimeDb } from '../config/firebase'

export interface FieldObservation {
  id: string
  timestamp: string
  latitude: number
  longitude: number
  species: string
  abundance: string
  habitat: string
  notes: string
  collectorName: string
  photos?: string[]
  verified?: boolean
  verifiedBy?: string
  verifiedAt?: string
}

/**
 * Save field observation to Realtime Database
 */
export async function saveFieldObservation(observation: Omit<FieldObservation, 'id'>): Promise<string> {
  const observationsRef = ref(realtimeDb!, 'field_observations')
  const newObservationRef = push(observationsRef)

  const observationWithId: FieldObservation = {
    ...observation,
    id: newObservationRef.key!,
  }

  await set(newObservationRef, observationWithId)
  return newObservationRef.key!
}

/**
 * Update existing field observation
 */
export async function updateFieldObservation(id: string, updates: Partial<FieldObservation>): Promise<void> {
  const observationRef = ref(realtimeDb!, `field_observations/${id}`)
  await update(observationRef, updates)
}

/**
 * Delete field observation
 */
export async function deleteFieldObservation(id: string): Promise<void> {
  const observationRef = ref(realtimeDb!, `field_observations/${id}`)
  await remove(observationRef)
}

/**
 * Get single field observation
 */
export async function getFieldObservation(id: string): Promise<FieldObservation | null> {
  const observationRef = ref(realtimeDb!, `field_observations/${id}`)
  const snapshot = await get(observationRef)

  if (!snapshot.exists()) {
    return null
  }

  return snapshot.val()
}

/**
 * Get all field observations
 */
export async function getAllFieldObservations(): Promise<FieldObservation[]> {
  const observationsRef = ref(realtimeDb!, 'field_observations')
  const snapshot = await get(observationsRef)

  if (!snapshot.exists()) {
    return []
  }

  const observations: FieldObservation[] = []
  snapshot.forEach((childSnapshot) => {
    observations.push(childSnapshot.val())
  })

  return observations
}

/**
 * Get recent field observations (last N observations)
 */
export async function getRecentObservations(limit: number = 50): Promise<FieldObservation[]> {
  const observationsRef = ref(realtimeDb!, 'field_observations')
  const recentQuery = query(observationsRef, orderByChild('timestamp'), limitToLast(limit))

  const snapshot = await get(recentQuery)

  if (!snapshot.exists()) {
    return []
  }

  const observations: FieldObservation[] = []
  snapshot.forEach((childSnapshot) => {
    observations.push(childSnapshot.val())
  })

  return observations.reverse() // Most recent first
}

/**
 * Subscribe to real-time field observation updates
 * Returns unsubscribe function
 */
export function subscribeToFieldObservations(
  callback: (observations: FieldObservation[]) => void
): () => void {
  const observationsRef = ref(realtimeDb!, 'field_observations')

  const handleUpdate = (snapshot: DataSnapshot) => {
    if (!snapshot.exists()) {
      callback([])
      return
    }

    const observations: FieldObservation[] = []
    snapshot.forEach((childSnapshot) => {
      observations.push(childSnapshot.val())
    })

    // Sort by timestamp, most recent first
    observations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    callback(observations)
  }

  onValue(observationsRef, handleUpdate)

  // Return unsubscribe function
  return () => {
    off(observationsRef, 'value', handleUpdate)
  }
}

/**
 * Subscribe to recent observations (last N)
 */
export function subscribeToRecentObservations(
  limit: number,
  callback: (observations: FieldObservation[]) => void
): () => void {
  const observationsRef = ref(realtimeDb!, 'field_observations')
  const recentQuery = query(observationsRef, orderByChild('timestamp'), limitToLast(limit))

  const handleUpdate = (snapshot: DataSnapshot) => {
    if (!snapshot.exists()) {
      callback([])
      return
    }

    const observations: FieldObservation[] = []
    snapshot.forEach((childSnapshot) => {
      observations.push(childSnapshot.val())
    })

    callback(observations.reverse()) // Most recent first
  }

  onValue(recentQuery, handleUpdate)

  return () => {
    off(recentQuery, 'value', handleUpdate)
  }
}

/**
 * Verify a field observation (staff only)
 */
export async function verifyObservation(
  id: string,
  verifiedBy: string
): Promise<void> {
  const observationRef = ref(realtimeDb!, `field_observations/${id}`)
  await update(observationRef, {
    verified: true,
    verifiedBy,
    verifiedAt: new Date().toISOString(),
  })
}

/**
 * Save live dashboard state (for persistence)
 */
export async function saveDashboardState(state: {
  selectedDataset?: string
  mapBounds?: Record<string, unknown>
  filters?: Record<string, unknown>
}): Promise<void> {
  const stateRef = ref(realtimeDb!, 'dashboard_state')
  await set(stateRef, {
    ...state,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Get dashboard state
 */
export async function getDashboardState(): Promise<Record<string, unknown> | null> {
  const stateRef = ref(realtimeDb!, 'dashboard_state')
  const snapshot = await get(stateRef)

  if (!snapshot.exists()) {
    return null
  }

  return snapshot.val()
}

/**
 * Subscribe to dashboard state changes
 */
export function subscribeToDashboardState(callback: (state: Record<string, unknown> | null) => void): () => void {
  const stateRef = ref(realtimeDb!, 'dashboard_state')

  const handleUpdate = (snapshot: DataSnapshot) => {
    callback(snapshot.val())
  }

  onValue(stateRef, handleUpdate)

  return () => {
    off(stateRef, 'value', handleUpdate)
  }
}
