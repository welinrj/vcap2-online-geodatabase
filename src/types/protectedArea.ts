import type { FeatureCollection } from 'geojson'

export type ProtectedAreaType = 'cca' | 'mpa'

export type ProtectedAreaStatus = 'proposed' | 'designated' | 'active' | 'inactive'

export interface ProtectedAreaAttachment {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  data: string // base64-encoded
}

export interface ProtectedArea {
  id: string
  name: string
  type: ProtectedAreaType
  status: ProtectedAreaStatus
  description: string
  island: string
  province: string
  areaHa: number | null
  designatedDate: string
  managementAuthority: string
  boundary: FeatureCollection | null
  attachments: ProtectedAreaAttachment[]
  createdAt: string
  updatedAt: string
  githubSha?: string
}

export interface ProtectedAreaSummary {
  id: string
  name: string
  type: ProtectedAreaType
  status: ProtectedAreaStatus
  island: string
  province: string
  areaHa: number | null
  createdAt: string
  updatedAt: string
}
