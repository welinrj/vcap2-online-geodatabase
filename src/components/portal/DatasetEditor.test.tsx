import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DatasetEditor from './DatasetEditor'
import type { DatasetMetadata } from '../../types/geospatial'

const mockMetadata: DatasetMetadata = {
  name: 'Test Dataset',
  description: 'Test desc',
  source: 'Test source',
  license: 'CC-BY-4.0',
  tags: ['vanuatu', 'test'],
  crs: 'EPSG:4326',
  status: 'active',
}

describe('DatasetEditor', () => {
  it('renders form with existing values', () => {
    render(
      <DatasetEditor metadata={mockMetadata} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByDisplayValue('Test Dataset')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Test desc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Test source')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CC-BY-4.0')).toBeInTheDocument()
    expect(screen.getByDisplayValue('vanuatu, test')).toBeInTheDocument()
  })

  it('calls onSave with updated values', () => {
    const onSave = vi.fn()
    render(
      <DatasetEditor metadata={mockMetadata} onSave={onSave} onCancel={vi.fn()} />,
    )

    const nameInput = screen.getByDisplayValue('Test Dataset')
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } })

    fireEvent.click(screen.getByText('Save Changes'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Name' }),
    )
  })

  it('calls onCancel when cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <DatasetEditor metadata={mockMetadata} onSave={vi.fn()} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
