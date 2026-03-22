import { createContext } from 'react'
import type { ProDocEntry } from '../data/prodocTrackerData'
import type { ColumnDef } from '../services/prodocStore'

export interface ProDocContextValue {
  newAreas: ProDocEntry[]
  existingAreas: ProDocEntry[]
  columns: ColumnDef[]
  isLoading: boolean
  isDirty: boolean
  isSaving: boolean
  saveStatus: 'idle' | 'saved' | 'error'
  setNewAreas: React.Dispatch<React.SetStateAction<ProDocEntry[]>>
  setExistingAreas: React.Dispatch<React.SetStateAction<ProDocEntry[]>>
  setColumns: React.Dispatch<React.SetStateAction<ColumnDef[]>>
  markDirty: () => void
  handleSave: () => Promise<void>
}

export const ProDocContext = createContext<ProDocContextValue | null>(null)
