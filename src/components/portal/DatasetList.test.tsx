import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DatasetList from './DatasetList'
import type { DatasetSummary } from '../../types/geospatial'

const mockDatasets: DatasetSummary[] = [
  {
    id: 'ds_1',
    metadata: {
      name: 'Test Dataset',
      description: 'A test dataset',
      source: 'Test',
      license: '',
      tags: [],
      crs: 'EPSG:4326',
      status: 'active',
    },
    format: 'geojson',
    featureCount: 10,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    sizeBytes: 1024,
  },
]

describe('DatasetList', () => {
  it('renders empty state when no datasets', () => {
    render(
      <DatasetList datasets={[]} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByText(/No datasets yet/)).toBeInTheDocument()
  })

  it('renders dataset rows', () => {
    render(
      <DatasetList
        datasets={mockDatasets}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Test Dataset')).toBeInTheDocument()
    expect(screen.getByText('GEOJSON')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('calls onView when clicking dataset name', () => {
    const onView = vi.fn()
    render(
      <DatasetList
        datasets={mockDatasets}
        onView={onView}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Test Dataset'))
    expect(onView).toHaveBeenCalledWith('ds_1')
  })

  it('calls onEdit when clicking edit button', () => {
    const onEdit = vi.fn()
    render(
      <DatasetList
        datasets={mockDatasets}
        onView={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledWith('ds_1')
  })

  it('calls onDelete when clicking delete button', () => {
    const onDelete = vi.fn()
    render(
      <DatasetList
        datasets={mockDatasets}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith('ds_1')
  })
})
