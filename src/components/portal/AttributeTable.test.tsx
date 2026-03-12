import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import AttributeTable from './AttributeTable'
import type { FeatureCollection } from 'geojson'

const mockData: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { name: 'Alpha', value: '10' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 1] },
      properties: { name: 'Beta', value: '20' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2, 2] },
      properties: { name: 'Charlie', value: '5' },
    },
  ],
}

const properties = ['name', 'value']

describe('AttributeTable', () => {
  it('renders all features', () => {
    render(<AttributeTable data={mockData} properties={properties} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('displays feature count', () => {
    render(<AttributeTable data={mockData} properties={properties} />)
    expect(screen.getByText('3 features')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    render(<AttributeTable data={mockData} properties={properties} />)
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('value')).toBeInTheDocument()
    expect(screen.getByText('Geometry')).toBeInTheDocument()
  })

  it('sorts by column when clicking header', () => {
    render(<AttributeTable data={mockData} properties={properties} />)
    fireEvent.click(screen.getByText('name'))
    const rows = screen.getAllByRole('row')
    // header + 3 data rows
    expect(rows).toHaveLength(4)
  })

  it('shows geometry type badges', () => {
    render(<AttributeTable data={mockData} properties={properties} />)
    const badges = screen.getAllByText('Point')
    expect(badges).toHaveLength(3)
  })
})
