import { useState, useEffect, useCallback, useRef, type FC, type ReactNode } from 'react'
import type { ProDocEntry, CoreIndicator5Entry } from '../data/prodocTrackerData'
import {
  newAreas as defaultNewAreas,
  existingAreas as defaultExistingAreas,
  coreIndicator5Sites as defaultCI5Sites,
} from '../data/prodocTrackerData'
import {
  loadProDocData,
  saveProDocData,
  onProDocDataChanged,
  type ColumnDef,
} from '../services/prodocStore'
import { ProDocContext } from './proDocContextDef'

// IDs reclassified from Existing → New (migration applied on load)
const RECLASSIFIED_TO_NEW = new Set(['MPA250302', 'MPA250301', 'MTPA2501', 'MPA2402'])

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', type: 'text', builtin: true },
  { key: 'name', label: 'Boundary Name', type: 'text', builtin: true },
  { key: 'areaCouncil', label: 'Area Council', type: 'text', builtin: true },
  { key: 'beneficiary', label: 'Beneficiary', type: 'text', builtin: true },
  { key: 'ccaType', label: 'Type', type: 'select', options: ['Marine', 'Marine & Terrestrial', 'Terrestrial'], builtin: true },
  { key: 'status', label: 'Status', type: 'select', options: ['New', 'Existing'], builtin: true },
  { key: 'hectaresTerrestrial', label: 'Terrestrial (ha)', type: 'number', builtin: true },
  { key: 'hectaresMarine', label: 'Marine (ha)', type: 'number', builtin: true },
  { key: 'mappingStatus', label: 'Mapping Status', type: 'select', options: ['Completed', 'In Progress', ''], builtin: true },
  { key: 'registrationStatus', label: 'Registration Status', type: 'select', options: ['Registered', 'Not Yet Registered', ''], builtin: true },
  { key: 'remarks', label: 'Remarks', type: 'text', builtin: true },
]

/** Apply migration: move reclassified entries from existing → new */
function applyMigration(
  newAreas: ProDocEntry[],
  existingAreas: ProDocEntry[],
): { newAreas: ProDocEntry[]; existingAreas: ProDocEntry[] } {
  const { toMigrate, prunedExisting } = existingAreas.reduce(
    (acc, e) => {
      if (RECLASSIFIED_TO_NEW.has(e.id)) acc.toMigrate.push({ ...e, status: 'New' as const })
      else acc.prunedExisting.push(e)
      return acc
    },
    { toMigrate: [] as ProDocEntry[], prunedExisting: [] as ProDocEntry[] },
  )
  const alreadyInNew = new Set(newAreas.map((e) => e.id))
  const toAppend = toMigrate.filter((e) => !alreadyInNew.has(e.id))
  return {
    newAreas: [...newAreas, ...toAppend],
    existingAreas: prunedExisting,
  }
}

export const ProDocProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [newAreas, setNewAreas] = useState<ProDocEntry[]>(() => [...defaultNewAreas])
  const [existingAreas, setExistingAreas] = useState<ProDocEntry[]>(() => [...defaultExistingAreas])
  const [columns, setColumns] = useState<ColumnDef[]>(() => [...DEFAULT_COLUMNS])
  const [coreIndicator5, setCoreIndicator5] = useState<CoreIndicator5Entry[]>(() => [...defaultCI5Sites])
  const [isLoading, setIsLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const initialLoadDone = useRef(false)
  // Track whether the local user has unsaved edits — skip incoming snapshot while dirty
  const dirtyRef = useRef(false)

  // Initial load from Firestore with timeout, then subscribe to real-time updates
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true

    const TIMEOUT_MS = 8_000
    const loadWithTimeout = Promise.race([
      loadProDocData(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ])

    loadWithTimeout
      .then((saved) => {
        if (saved) {
          const migrated = applyMigration(saved.newAreas, saved.existingAreas)
          setNewAreas(migrated.newAreas)
          setExistingAreas(migrated.existingAreas)
          setColumns(saved.columns)
          if (saved.coreIndicator5) setCoreIndicator5(saved.coreIndicator5)
        }
      })
      .catch(() => {
        // Failed to load — use defaults
      })
      .finally(() => setIsLoading(false))

    // Subscribe to real-time updates from Firestore
    const unsubscribe = onProDocDataChanged((data) => {
      // Don't overwrite local edits that haven't been saved yet
      if (dirtyRef.current) return
      if (!data) return
      const migrated = applyMigration(data.newAreas, data.existingAreas)
      setNewAreas(migrated.newAreas)
      setExistingAreas(migrated.existingAreas)
      setColumns(data.columns)
      if (data.coreIndicator5) setCoreIndicator5(data.coreIndicator5)
    })

    return unsubscribe
  }, [setNewAreas, setExistingAreas, setColumns])

  const markDirty = useCallback(() => {
    if (!isLoading) {
      setIsDirty(true)
      dirtyRef.current = true
      setSaveStatus('idle')
    }
  }, [isLoading])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      await saveProDocData(newAreas, existingAreas, columns, coreIndicator5)
      setIsDirty(false)
      dirtyRef.current = false
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }, [newAreas, existingAreas, columns, coreIndicator5])

  return (
    <ProDocContext.Provider
      value={{
        newAreas,
        existingAreas,
        columns,
        coreIndicator5,
        isLoading,
        isDirty,
        isSaving,
        saveStatus,
        setNewAreas,
        setExistingAreas,
        setColumns,
        setCoreIndicator5,
        markDirty,
        handleSave,
      }}
    >
      {children}
    </ProDocContext.Provider>
  )
}
