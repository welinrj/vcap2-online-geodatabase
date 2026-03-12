/**
 * Firebase Firestore Dataset Service
 *
 * Manages geospatial datasets in Firestore with real-time syncing
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import type { DatasetSummary, GeoDataset } from '../types/geospatial'

const DATASETS_COLLECTION = 'datasets'
const METADATA_COLLECTION = 'dataset_metadata'

/**
 * Save dataset to Firestore
 * Large GeoJSON data should be stored in Cloud Storage and referenced by URL
 */
export async function saveDataset(dataset: GeoDataset, storageUrl?: string): Promise<void> {
  const metadata: DatasetSummary = {
    id: dataset.id,
    metadata: dataset.metadata,
    format: dataset.format,
    featureCount: dataset.featureCount,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
    sizeBytes: dataset.sizeBytes,
    githubSha: dataset.githubSha,
  }

  // Save metadata
  await setDoc(doc(db!, METADATA_COLLECTION, dataset.id), {
    ...metadata,
    storageUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Save full dataset (for smaller datasets)
  // For larger datasets, use Cloud Storage and only save reference
  if (!storageUrl) {
    await setDoc(doc(db!, DATASETS_COLLECTION, dataset.id), {
      ...dataset,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

/**
 * Get dataset by ID
 */
export async function getDataset(id: string): Promise<GeoDataset | null> {
  const docRef = doc(db!, DATASETS_COLLECTION, id)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    return null
  }

  const data = docSnap.data()
  return {
    id: data.id,
    metadata: data.metadata,
    format: data.format,
    featureCount: data.featureCount,
    bbox: data.bbox,
    properties: data.properties || [],
    createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
    sizeBytes: data.sizeBytes,
    data: data.data,
    githubSha: data.githubSha,
  }
}

/**
 * Get dataset metadata by ID
 */
export async function getDatasetMetadata(id: string): Promise<DatasetSummary | null> {
  const docRef = doc(db!, METADATA_COLLECTION, id)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    return null
  }

  const data = docSnap.data()
  return {
    id: data.id,
    metadata: data.metadata,
    format: data.format,
    featureCount: data.featureCount || 0,
    createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
    sizeBytes: data.sizeBytes || 0,
    githubSha: data.githubSha,
  }
}

/**
 * List all dataset metadata
 */
export async function listDatasets(
  filters?: {
    format?: string
    limit?: number
  }
): Promise<DatasetSummary[]> {
  const constraints: QueryConstraint[] = []

  if (filters?.format) {
    constraints.push(where('format', '==', filters.format))
  }

  constraints.push(orderBy('createdAt', 'desc'))

  const q = query(collection(db!, METADATA_COLLECTION), ...constraints)
  const querySnapshot = await getDocs(q)

  const datasets: DatasetSummary[] = []
  querySnapshot.forEach((doc) => {
    const data = doc.data()
    datasets.push({
      id: data.id,
      metadata: data.metadata,
      format: data.format,
      featureCount: data.featureCount || 0,
      createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
      sizeBytes: data.sizeBytes || 0,
      githubSha: data.githubSha,
    })
  })

  return datasets
}

/**
 * Delete dataset
 */
export async function deleteDataset(id: string): Promise<void> {
  // Delete metadata
  await deleteDoc(doc(db!, METADATA_COLLECTION, id))

  // Delete full dataset
  try {
    await deleteDoc(doc(db!, DATASETS_COLLECTION, id))
  } catch {
    // Dataset might only exist as metadata if stored in Cloud Storage
    console.log('No full dataset document to delete:', id)
  }
}

/**
 * Subscribe to real-time dataset updates
 */
export function subscribeToDatasets(
  callback: (datasets: DatasetSummary[]) => void,
  filters?: {
    format?: string
  }
): () => void {
  const constraints: QueryConstraint[] = []

  if (filters?.format) {
    constraints.push(where('format', '==', filters.format))
  }

  constraints.push(orderBy('createdAt', 'desc'))

  const q = query(collection(db!, METADATA_COLLECTION), ...constraints)

  return onSnapshot(q, (querySnapshot) => {
    const datasets: DatasetSummary[] = []
    querySnapshot.forEach((doc) => {
      const data = doc.data()
      datasets.push({
        id: data.id,
        metadata: data.metadata,
        format: data.format,
        featureCount: data.featureCount || 0,
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
        sizeBytes: data.sizeBytes || 0,
        githubSha: data.githubSha,
      })
    })
    callback(datasets)
  })
}

/**
 * Update dataset metadata
 */
export async function updateDatasetMetadata(
  id: string,
  updates: Partial<Pick<DatasetSummary, 'metadata' | 'format'>>
): Promise<void> {
  const docRef = doc(db!, METADATA_COLLECTION, id)
  await setDoc(
    docRef,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

/**
 * Get storage estimate (approximate)
 * Note: Firestore doesn't provide direct storage quotas like IndexedDB
 */
export async function getStorageEstimate(): Promise<{
  usage: number
  quota: number
}> {
  // This is a placeholder - actual storage tracking would need
  // to sum up document sizes or use Firebase Admin SDK
  return {
    usage: 0,
    quota: Infinity,
  }
}
