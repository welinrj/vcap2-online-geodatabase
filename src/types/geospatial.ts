import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'

export type DatasetFormat = 'geojson' | 'csv' | 'kml'

export type DatasetStatus = 'active' | 'archived' | 'draft'

/**
 * ProDoc Indicator categories for classifying datasets by conservation type.
 * Each category maps to a specific end-of-project target area (in hectares).
 */
export type ProDocCategory =
  | '1.1' // New Community Conservation Areas
  | '1.2' // Existing Community Conservation Areas strengthened
  | '2.1' // New Marine Protected Areas
  | '2.2' // Existing Marine Protected Areas strengthened
  | ''    // Uncategorized

export interface ProDocCategoryInfo {
  id: ProDocCategory
  label: string
  description: string
  targetHa: number
}

export const PRODOC_CATEGORIES: ProDocCategoryInfo[] = [
  {
    id: '1.1',
    label: '1.1 — New CCA',
    description: 'New Community Conservation Areas (Terrestrial protected areas newly created)',
    targetHa: 2298,
  },
  {
    id: '1.2',
    label: '1.2 — Existing CCA Strengthened',
    description: 'Existing Community Conservation Areas strengthened (Terrestrial protected areas under improved management effectiveness)',
    targetHa: 11215,
  },
  {
    id: '2.1',
    label: '2.1 — New MPA',
    description: 'New Marine Protected Areas (MPA / CBFM newly created)',
    targetHa: 575,
  },
  {
    id: '2.2',
    label: '2.2 — Existing MPA Strengthened',
    description: 'Existing Marine Protected Areas strengthened (MPA / CBFM under improved management effectiveness)',
    targetHa: 1766,
  },
]

export interface DatasetMetadata {
  name: string
  description: string
  source: string
  license: string
  tags: string[]
  crs: string
  status: DatasetStatus
  category: ProDocCategory
  portalCategory?: string // portal_categories document ID
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

/**
 * Portal category — dynamic categories stored in Firestore
 * for organising datasets on the public portal.
 */
export interface PortalCategory {
  id: string
  name: string
  description: string
  icon: string          // lucide icon name
  color: string         // hex colour for badge/accent
  sortOrder: number
  datasetCount?: number // derived at runtime
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
