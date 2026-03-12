import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

export type DatasetFormat = 'geojson' | 'csv' | 'kml'

export type DatasetStatus = 'active' | 'archived' | 'draft'

export interface DatasetMetadata {
  name: string
  description: string
  source: string
  license: string
  tags: string[]
  crs: string
  status: DatasetStatus
}

export interface GeoDataset {
  id: string
  metadata: DatasetMetadata
  format: DatasetFormat
  featureCount: number
  bbox: [number, number, number, number] | null
  properties: string[]
  createdAt: string
  updatedAt: string
  sizeBytes: number
  data: FeatureCollection<Geometry, GeoJsonProperties>
  /** SHA of the file on GitHub (set after sync) */
  githubSha?: string
}

export interface DatasetSummary {
  id: string
  metadata: DatasetMetadata
  format: DatasetFormat
  featureCount: number
  createdAt: string
  updatedAt: string
  sizeBytes: number
  /** SHA of the file on GitHub (set after sync) */
  githubSha?: string
}
