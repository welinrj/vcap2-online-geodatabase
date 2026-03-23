import { createContext } from 'react'
import type { ProDocEntry, CoreIndicator5Entry } from '../data/prodocTrackerData'
import type { ColumnDef } from '../services/prodocStore'

export interface ProDocContextValue {
  newAreas: ProDocEntry[]
  existingAreas: ProDocEntry[]
  columns: ColumnDef[]
  coreIndicator5: CoreIndicator5Entry[]
  isLoading: boolean
  isDirty: boolean
  isSaving: boolean
  saveStatus: 'idle' | 'saved' | 'error'
  setNewAreas: React.Dispatch<React.SetStateAction<ProDocEntry[]>>
  setExistingAreas: React.Dispatch<React.SetStateAction<ProDocEntry[]>>
  setColumns: React.Dispatch<React.SetStateAction<ColumnDef[]>>
  setCoreIndicator5: React.Dispatch<React.SetStateAction<CoreIndicator5Entry[]>>
  markDirty: () => void
  handleSave: () => Promise<void>
}

export const ProDocContext = createContext<ProDocContextValue | null>(null)
