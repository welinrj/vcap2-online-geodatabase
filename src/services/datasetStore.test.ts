import { describe, it, expect, beforeEach } from 'vitest'
import {
  addDataset,
  listDatasets,
  getDataset,
  deleteDataset,
  updateDatasetMetadata,
  parseGeoJSON,
  parseCSV,
  formatBytes,
  _resetForTests,
} from './datasetStore'
import type { FeatureCollection } from 'geojson'

const sampleFC: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [168.3, -17.7] },
      properties: { name: 'Test Point', value: 42 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [167.1, -15.4] },
      properties: { name: 'Another Point', value: 7 },
    },
  ],
}

beforeEach(() => {
  _resetForTests()
  localStorage.clear()
  // Firestore mock store is cleared automatically by test/setup.ts
})

describe('addDataset', () => {
  it('creates a dataset and returns it', async () => {
    const ds = await addDataset(sampleFC, { name: 'Test Data' }, 'geojson')
    expect(ds.id).toMatch(/^ds_/)
    expect(ds.metadata.name).toBe('Test Data')
    expect(ds.featureCount).toBe(2)
    expect(ds.format).toBe('geojson')
    expect(ds.properties).toContain('name')
    expect(ds.properties).toContain('value')
  })

  it('computes bounding box', async () => {
    const ds = await addDataset(sampleFC, { name: 'BBox Test' }, 'geojson')
    expect(ds.bbox).not.toBeNull()
    expect(ds.bbox![0]).toBeCloseTo(167.1)
    expect(ds.bbox![1]).toBeCloseTo(-17.7)
    expect(ds.bbox![2]).toBeCloseTo(168.3)
    expect(ds.bbox![3]).toBeCloseTo(-15.4)
  })
})

describe('listDatasets', () => {
  it('returns empty list initially', async () => {
    expect(await listDatasets()).toEqual([])
  })

  it('lists added datasets', async () => {
    await addDataset(sampleFC, { name: 'DS 1' }, 'geojson')
    // Small delay so timestamps differ for deterministic sort order
    await new Promise((r) => setTimeout(r, 10))
    await addDataset(sampleFC, { name: 'DS 2' }, 'csv')
    const list = await listDatasets()
    expect(list).toHaveLength(2)
    const names = list.map((d) => d.metadata.name)
    expect(names).toContain('DS 1')
    expect(names).toContain('DS 2')
  })
})

describe('getDataset', () => {
  it('retrieves a stored dataset with data', async () => {
    const created = await addDataset(sampleFC, { name: 'Retrievable' }, 'geojson')
    const fetched = await getDataset(created.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.data.features).toHaveLength(2)
    expect(fetched!.metadata.name).toBe('Retrievable')
  })

  it('returns null for unknown id', async () => {
    expect(await getDataset('nonexistent')).toBeNull()
  })
})

describe('updateDatasetMetadata', () => {
  it('updates metadata fields', async () => {
    const ds = await addDataset(sampleFC, { name: 'Original' }, 'geojson')
    const updated = await updateDatasetMetadata(ds.id, {
      name: 'Renamed',
      description: 'New desc',
      tags: ['a', 'b'],
    })
    expect(updated).not.toBeNull()
    expect(updated!.metadata.name).toBe('Renamed')
    expect(updated!.metadata.description).toBe('New desc')
    expect(updated!.metadata.tags).toEqual(['a', 'b'])
  })

  it('returns null for unknown id', async () => {
    expect(await updateDatasetMetadata('nonexistent', { name: 'X' })).toBeNull()
  })
})

describe('deleteDataset', () => {
  it('removes dataset', async () => {
    const ds = await addDataset(sampleFC, { name: 'To Delete' }, 'geojson')
    expect(await deleteDataset(ds.id)).toBe(true)
    expect(await listDatasets()).toHaveLength(0)
    expect(await getDataset(ds.id)).toBeNull()
  })

  it('returns false for unknown id', async () => {
    expect(await deleteDataset('nonexistent')).toBe(false)
  })
})

describe('parseGeoJSON', () => {
  it('parses FeatureCollection', () => {
    const text = JSON.stringify(sampleFC)
    const result = parseGeoJSON(text)
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(2)
  })

  it('wraps a single Feature in a FeatureCollection', () => {
    const feature = sampleFC.features[0]
    const result = parseGeoJSON(JSON.stringify(feature))
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)
  })

  it('wraps a bare Geometry in a FeatureCollection', () => {
    const geom = { type: 'Point', coordinates: [0, 0] }
    const result = parseGeoJSON(JSON.stringify(geom))
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.type).toBe('Point')
  })

  it('throws on invalid input', () => {
    expect(() => parseGeoJSON('{"foo": "bar"}')).toThrow('Invalid GeoJSON')
  })
})

describe('parseCSV', () => {
  it('parses CSV with latitude/longitude columns', () => {
    const csv = 'name,latitude,longitude,value\nA,10,20,100\nB,30,40,200'
    const result = parseCSV(csv)
    expect(result.features).toHaveLength(2)
    expect(result.features[0].geometry.type).toBe('Point')
    expect(result.features[0].geometry).toHaveProperty('coordinates', [20, 10])
    expect(result.features[0].properties).toHaveProperty('name', 'A')
    expect(result.features[0].properties).toHaveProperty('value', '100')
  })

  it('throws if lat/lng columns missing', () => {
    const csv = 'name,x,y\nA,10,20'
    expect(() => parseCSV(csv)).toThrow("CSV must contain")
  })

  it('throws on too few rows', () => {
    expect(() => parseCSV('header')).toThrow('at least one data row')
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1 MB')
  })
})
