/**
 * Firebase Cloud Storage Service
 *
 * Handles uploading and downloading large GeoJSON files to Firebase Storage
 */

import {
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
  deleteObject,
  getMetadata,
  listAll,
  type UploadMetadata,
} from 'firebase/storage'
import { storage } from '../config/firebase'

const GEOJSON_BUCKET = 'geojson-datasets'
const FIELD_DATA_BUCKET = 'field-data'

function requireStorage() {
  if (!storage) throw new Error('Firebase Storage is not configured')
  return storage
}

/**
 * Upload GeoJSON dataset to Cloud Storage
 */
export async function uploadGeoJSON(
  datasetId: string,
  geoJSON: Record<string, unknown>,
  metadata?: {
    name?: string
    category?: string
    uploadedBy?: string
  }
): Promise<string> {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)

  const customMetadata: UploadMetadata = {
    contentType: 'application/geo+json',
    customMetadata: {
      datasetId,
      ...metadata,
      uploadDate: new Date().toISOString(),
    },
  }

  const jsonString = JSON.stringify(geoJSON)
  await uploadString(storageRef, jsonString, 'raw', customMetadata)

  // Get download URL
  const downloadURL = await getDownloadURL(storageRef)
  return downloadURL
}

/**
 * Upload GeoJSON file (from File object)
 */
export async function uploadGeoJSONFile(
  datasetId: string,
  file: File,
  metadata?: {
    name?: string
    category?: string
    uploadedBy?: string
  }
): Promise<string> {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)

  const customMetadata: UploadMetadata = {
    contentType: 'application/geo+json',
    customMetadata: {
      datasetId,
      ...metadata,
      uploadDate: new Date().toISOString(),
    },
  }

  await uploadBytes(storageRef, file, customMetadata)

  // Get download URL
  const downloadURL = await getDownloadURL(storageRef)
  return downloadURL
}

/**
 * Download GeoJSON from Cloud Storage
 */
export async function downloadGeoJSON(datasetId: string): Promise<Record<string, unknown>> {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)

  const url = await getDownloadURL(storageRef)
  const response = await fetch(url)
  const geoJSON = await response.json()

  return geoJSON
}

/**
 * Get download URL for a dataset
 */
export async function getGeoJSONUrl(datasetId: string): Promise<string> {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)
  return await getDownloadURL(storageRef)
}

/**
 * Delete GeoJSON from Cloud Storage
 */
export async function deleteGeoJSON(datasetId: string): Promise<void> {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)
  await deleteObject(storageRef)
}

/**
 * Get file metadata
 */
export async function getFileMetadata(datasetId: string) {
  const fileName = `${datasetId}.geojson`
  const storageRef = ref(requireStorage(), `${GEOJSON_BUCKET}/${fileName}`)
  return await getMetadata(storageRef)
}

/**
 * Upload field data observation (from Field Collector)
 */
export async function uploadFieldData(
  observationId: string,
  data: Record<string, unknown>,
  metadata?: {
    collectorName?: string
    observationDate?: string
    latitude?: number
    longitude?: number
  }
): Promise<string> {
  const fileName = `${observationId}.json`
  const storageRef = ref(requireStorage(), `${FIELD_DATA_BUCKET}/${fileName}`)

  const customMeta: Record<string, string> = {
    observationId,
    uploadDate: new Date().toISOString(),
  }

  if (metadata?.collectorName) customMeta.collectorName = metadata.collectorName
  if (metadata?.observationDate) customMeta.observationDate = metadata.observationDate
  if (metadata?.latitude !== undefined) customMeta.latitude = metadata.latitude.toString()
  if (metadata?.longitude !== undefined) customMeta.longitude = metadata.longitude.toString()

  const customMetadata: UploadMetadata = {
    contentType: 'application/json',
    customMetadata: customMeta,
  }

  const jsonString = JSON.stringify(data)
  await uploadString(storageRef, jsonString, 'raw', customMetadata)

  const downloadURL = await getDownloadURL(storageRef)
  return downloadURL
}

/**
 * Upload image attachment for field observation
 */
export async function uploadFieldImage(
  observationId: string,
  imageFile: File,
  imageIndex: number
): Promise<string> {
  const fileExtension = imageFile.name.split('.').pop()
  const fileName = `${observationId}_${imageIndex}.${fileExtension}`
  const storageRef = ref(requireStorage(), `${FIELD_DATA_BUCKET}/images/${fileName}`)

  const metadata: UploadMetadata = {
    contentType: imageFile.type,
    customMetadata: {
      observationId,
      imageIndex: imageIndex.toString(),
      uploadDate: new Date().toISOString(),
    },
  }

  await uploadBytes(storageRef, imageFile, metadata)

  const downloadURL = await getDownloadURL(storageRef)
  return downloadURL
}

/**
 * List all datasets in storage
 */
export async function listStoredDatasets(): Promise<string[]> {
  const storageRef = ref(requireStorage(), GEOJSON_BUCKET)
  const result = await listAll(storageRef)

  return result.items.map((item) => item.name.replace('.geojson', ''))
}

/**
 * Get storage usage estimate
 */
export async function getStorageUsage(): Promise<{
  totalBytes: number
  fileCount: number
}> {
  const storageRef = ref(requireStorage(), GEOJSON_BUCKET)
  const result = await listAll(storageRef)

  let totalBytes = 0
  for (const item of result.items) {
    const metadata = await getMetadata(item)
    totalBytes += metadata.size
  }

  return {
    totalBytes,
    fileCount: result.items.length,
  }
}
