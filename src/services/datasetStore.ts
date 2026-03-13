import type {
  GeoDataset,
  DatasetSummary,
  DatasetMetadata,
  DatasetFormat,
} from '../types/geospatial'
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import { db } from './firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore'

const COLLECTION = 'datasets'
const CHUNKS_SUB = 'chunks'

/**
 * Firestore limits: no nested arrays, 1 MB per document.
 * Strategy: store metadata in the parent doc, serialize the GeoJSON
 * FeatureCollection as a JSON string, then split it into ≤800 KB
 * chunk documents in a `chunks` subcollection.  This removes any
 * practical size limit on datasets.
 */
const CHUNK_SIZE = 800_000 // 800 KB per chunk doc — safely under 1 MB

/** Write a dataset: metadata in parent doc, geo data in chunks subcollection */
async function writeDataset(dataset: GeoDataset): Promise<void> {
  const { data, ...meta } = dataset
  const json = JSON.stringify(data)
  const numChunks = Math.ceil(json.length / CHUNK_SIZE)

  // Parent doc stores everything except raw geo data
  const parentRef = doc(db, COLLECTION, dataset.id)
  await setDoc(parentRef, { ...meta, _chunkCount: numChunks })

  // Write chunks in batches of 500 (Firestore batch limit)
  for (let batchStart = 0; batchStart < numChunks; batchStart += 499) {
    const batch = writeBatch(db)
    const batchEnd = Math.min(batchStart + 499, numChunks)
    for (let i = batchStart; i < batchEnd; i++) {
      const chunkRef = doc(db, COLLECTION, dataset.id, CHUNKS_SUB, String(i))
      batch.set(chunkRef, { d: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) })
    }
    await batch.commit()
  }
}

/** Read geo data back by reassembling chunks */
async function readGeoData(datasetId: string): Promise<FeatureCollection> {
  const chunksSnap = await getDocs(
    collection(db, COLLECTION, datasetId, CHUNKS_SUB),
  )

  if (chunksSnap.empty) {
    // Fall back: try reading legacy formats from the parent doc
    const parentSnap = await getDoc(doc(db, COLLECTION, datasetId))
    if (!parentSnap.exists()) throw new Error('Dataset not found')
    const raw = parentSnap.data() as Record<string, unknown>
    return readLegacyGeoData(raw)
  }

  // Sort chunks by numeric id and reassemble
  const sorted = chunksSnap.docs
    .map((d) => ({ idx: parseInt(d.id, 10), data: d.data().d as string }))
    .sort((a, b) => a.idx - b.idx)

  return JSON.parse(sorted.map((c) => c.data).join(''))
}

/** Handle old document formats that stored geo data inline */
function readLegacyGeoData(raw: Record<string, unknown>): FeatureCollection {
  // v2: single-doc chunked format (_geoData_0, _geoData_1, ...)
  if (typeof raw._geoChunks === 'number') {
    const chunks: string[] = []
    for (let i = 0; i < raw._geoChunks; i++) {
      chunks.push(raw[`_geoData_${i}`] as string)
    }
    return JSON.parse(chunks.join(''))
  }
  // v1: single _geoData field
  if (typeof raw._geoData === 'string') {
    return JSON.parse(raw._geoData as string)
  }
  // v0: raw nested data (pre-serialization)
  return (raw as unknown as GeoDataset).data
}

/** Delete all chunk documents for a dataset */
async function deleteChunks(datasetId: string): Promise<void> {
  const chunksSnap = await getDocs(
    collection(db, COLLECTION, datasetId, CHUNKS_SUB),
  )
  if (chunksSnap.empty) return

  for (let i = 0; i < chunksSnap.docs.length; i += 499) {
    const batch = writeBatch(db)
    const slice = chunksSnap.docs.slice(i, i + 499)
    for (const d of slice) {
      batch.delete(d.ref)
    }
    await batch.commit()
  }
}

/** No-op — kept for backward compatibility with tests */
export function _resetForTests(): void {
  // Firestore has no local connection to reset
}

function generateId(): string {
  return `ds_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function computeBbox(
  fc: FeatureCollection,
): [number, number, number, number] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let hasCoords = false

  function processCoords(coords: unknown): void {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords as [number, number]
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
      hasCoords = true
    } else {
      for (const item of coords) {
        processCoords(item)
      }
    }
  }

  for (const feature of fc.features) {
    if (feature.geometry && 'coordinates' in feature.geometry) {
      processCoords(feature.geometry.coordinates)
    }
  }

  return hasCoords ? [minLng, minLat, maxLng, maxLat] : null
}

function extractPropertyNames(fc: FeatureCollection): string[] {
  const keys = new Set<string>()
  for (const feature of fc.features) {
    if (feature.properties) {
      for (const key of Object.keys(feature.properties)) {
        keys.add(key)
      }
    }
  }
  return Array.from(keys).sort()
}

/**
 * Migrate any existing localStorage data to Firestore (runs once).
 * Safe to call multiple times — skips if data already exists.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const LEGACY_INDEX_KEY = 'vcap2-datasets-index'
    const LEGACY_STORAGE_KEY = 'vcap2-datasets'

    const raw = localStorage.getItem(LEGACY_INDEX_KEY)
    if (!raw) return

    const legacyIndex: DatasetSummary[] = JSON.parse(raw)
    if (legacyIndex.length === 0) {
      localStorage.removeItem(LEGACY_INDEX_KEY)
      return
    }

    // Migrate each dataset to Firestore
    for (const summary of legacyIndex) {
      const dataRaw = localStorage.getItem(`${LEGACY_STORAGE_KEY}:${summary.id}`)
      if (dataRaw) {
        const dataset: GeoDataset = JSON.parse(dataRaw)
        const ref = doc(db, COLLECTION, dataset.id)
        const existing = await getDoc(ref)
        if (!existing.exists()) {
          await writeDataset(dataset)
        }
      }
    }

    // Clean up localStorage
    localStorage.removeItem(LEGACY_INDEX_KEY)
    for (const s of legacyIndex) {
      localStorage.removeItem(`${LEGACY_STORAGE_KEY}:${s.id}`)
    }
  } catch {
    // Migration failure is non-fatal
  }
}

export async function listDatasets(): Promise<DatasetSummary[]> {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshotToSummaries(snapshot)
}

function snapshotToSummaries(snapshot: { docs: Array<{ data: () => Record<string, unknown> }> }): DatasetSummary[] {
  return snapshot.docs.map((d) => {
    const data = d.data() as unknown as GeoDataset
    return {
      id: data.id,
      metadata: data.metadata,
      format: data.format,
      featureCount: data.featureCount,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      sizeBytes: data.sizeBytes,
      githubSha: data.githubSha,
    } as DatasetSummary
  })
}

/**
 * Subscribe to real-time dataset list updates.
 * Returns an unsubscribe function.
 */
export function onDatasetsChanged(
  callback: (datasets: DatasetSummary[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshotToSummaries(snapshot))
  })
}

export async function getDataset(id: string): Promise<GeoDataset | null> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const meta = snapshot.data() as Record<string, unknown>
  const data = await readGeoData(id)
  return { ...meta, data } as unknown as GeoDataset
}

export async function addDataset(
  data: FeatureCollection<Geometry, GeoJsonProperties>,
  metadata: Partial<DatasetMetadata>,
  format: DatasetFormat,
): Promise<GeoDataset> {
  const id = generateId()
  const now = new Date().toISOString()
  const raw = JSON.stringify(data)

  const fullMetadata: DatasetMetadata = {
    name: metadata.name ?? 'Untitled Dataset',
    description: metadata.description ?? '',
    source: metadata.source ?? '',
    license: metadata.license ?? '',
    tags: metadata.tags ?? [],
    crs: metadata.crs ?? 'EPSG:4326',
    status: metadata.status ?? 'active',
    category: metadata.category ?? '',
  }

  const dataset: GeoDataset = {
    id,
    metadata: fullMetadata,
    format,
    featureCount: data.features.length,
    bbox: computeBbox(data),
    properties: extractPropertyNames(data),
    createdAt: now,
    updatedAt: now,
    sizeBytes: new Blob([raw]).size,
    data,
  }

  await writeDataset(dataset)
  return dataset
}

export async function updateDatasetMetadata(
  id: string,
  updates: Partial<DatasetMetadata>,
): Promise<GeoDataset | null> {
  const dataset = await getDataset(id)
  if (!dataset) return null

  dataset.metadata = { ...dataset.metadata, ...updates }
  dataset.updatedAt = new Date().toISOString()

  await updateDoc(doc(db, COLLECTION, id), {
    metadata: dataset.metadata,
    updatedAt: dataset.updatedAt,
  })

  return dataset
}

export async function deleteDataset(id: string): Promise<boolean> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return false

  await deleteChunks(id)
  await deleteDoc(ref)
  return true
}

// ── Parsers (synchronous — no storage involved) ──

export function parseGeoJSON(text: string): FeatureCollection {
  const parsed = JSON.parse(text)
  if (parsed.type === 'FeatureCollection') {
    return parsed as FeatureCollection
  }
  if (parsed.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed] }
  }
  if (parsed.type && parsed.coordinates) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: parsed, properties: {} }],
    }
  }
  throw new Error('Invalid GeoJSON: expected FeatureCollection, Feature, or Geometry')
}

export function parseCSV(
  text: string,
  latField = 'latitude',
  lngField = 'longitude',
): FeatureCollection {
  const lines = text.trim().split('\n')
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const latIdx = headers.findIndex(
    (h) => h.toLowerCase() === latField.toLowerCase(),
  )
  const lngIdx = headers.findIndex(
    (h) => h.toLowerCase() === lngField.toLowerCase(),
  )

  if (latIdx === -1 || lngIdx === -1) {
    throw new Error(
      `CSV must contain '${latField}' and '${lngField}' columns. Found: ${headers.join(', ')}`,
    )
  }

  const features = lines.slice(1).filter(Boolean).map((line, i) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    const lat = parseFloat(values[latIdx])
    const lng = parseFloat(values[lngIdx])

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Invalid coordinates on row ${i + 2}: lat=${values[latIdx]}, lng=${values[lngIdx]}`)
    }

    const properties: Record<string, string> = {}
    headers.forEach((h, j) => {
      if (j !== latIdx && j !== lngIdx) {
        properties[h] = values[j] ?? ''
      }
    })

    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [lng, lat],
      },
      properties,
    }
  })

  return { type: 'FeatureCollection', features }
}

export function parseKML(text: string): FeatureCollection {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid KML: XML parsing failed')
  }

  const placemarks = doc.querySelectorAll('Placemark')
  const features: FeatureCollection['features'] = []

  placemarks.forEach((pm) => {
    const name = pm.querySelector('name')?.textContent ?? ''
    const description = pm.querySelector('description')?.textContent ?? ''

    const point = pm.querySelector('Point coordinates')
    const lineString = pm.querySelector('LineString coordinates')
    const polygon = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates')

    const properties: Record<string, string> = { name, description }

    // Extract ExtendedData
    pm.querySelectorAll('ExtendedData Data, ExtendedData SimpleData').forEach((d) => {
      const key = d.getAttribute('name') ?? d.tagName
      properties[key] = d.textContent?.trim() ?? ''
    })

    if (point) {
      const coords = parseKMLCoords(point.textContent ?? '')
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords[0] },
          properties,
        })
      }
    } else if (lineString) {
      const coords = parseKMLCoords(lineString.textContent ?? '')
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties,
        })
      }
    } else if (polygon) {
      const coords = parseKMLCoords(polygon.textContent ?? '')
      if (coords.length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties,
        })
      }
    }
  })

  return { type: 'FeatureCollection', features }
}

function parseKMLCoords(text: string): number[][] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(',').map(Number)
      return parts.length >= 2 ? [parts[0], parts[1]] : []
    })
    .filter((c) => c.length >= 2)
}

/** Replace the GeoJSON feature data for a dataset, rewriting chunks and updating derived stats */
export async function updateDatasetFeatures(
  id: string,
  newData: FeatureCollection,
): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('Dataset not found')

  const raw = JSON.stringify(newData)
  const now = new Date().toISOString()
  const meta = snapshot.data() as Record<string, unknown>

  const updated: GeoDataset = {
    ...(meta as unknown as GeoDataset),
    data: newData,
    featureCount: newData.features.length,
    bbox: computeBbox(newData),
    properties: extractPropertyNames(newData),
    sizeBytes: new Blob([raw]).size,
    updatedAt: now,
  }

  await deleteChunks(id)
  await writeDataset(updated)
}

/** Update the githubSha for a dataset after sync */
export async function updateGitHubSha(
  id: string,
  sha: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return

  await updateDoc(ref, { githubSha: sha })
}

/** Export all datasets as a single JSON blob for backup */
export async function exportAllDatasets(): Promise<GeoDataset[]> {
  const snapshot = await getDocs(collection(db, COLLECTION))
  const results: GeoDataset[] = []
  for (const d of snapshot.docs) {
    const meta = d.data() as Record<string, unknown>
    const data = await readGeoData(d.id)
    results.push({ ...meta, data } as unknown as GeoDataset)
  }
  return results
}

/** Import datasets from a backup, skipping any that already exist */
export async function importDatasets(
  datasets: GeoDataset[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  for (const dataset of datasets) {
    const ref = doc(db, COLLECTION, dataset.id)
    const existing = await getDoc(ref)

    if (existing.exists()) {
      skipped++
      continue
    }

    await writeDataset(dataset)
    imported++
  }

  return { imported, skipped }
}

/** Get storage estimate (not applicable for Firestore) */
export async function getStorageEstimate(): Promise<{
  used: number
  quota: number
} | null> {
  // Firestore is cloud-hosted — no local quota to report
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
