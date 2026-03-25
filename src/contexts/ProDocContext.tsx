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

// New MPA entries confirmed registered from project documentation (March 2026)
const NEW_MPA_REGISTERED_IDS = new Set([
  'MPA2514', 'MPA2511', 'MPA2512', 'MPA2513', 'MPA2515', // South Maewo
  'MTPA2405', // Lonwolwol, West Ambrym
  'MTPA2402', 'MTPA2403', 'MTPA2404', // Linduri, Wusi, Vasalea, West Coast Santo
])

// Default existing MPA entries to inject if missing from DB (indicator 2.2)
const DEFAULT_EXISTING_MPAS: ProDocEntry[] = [
  {
    id: 'MPA-E01',
    name: 'Torres Islands Marine Reserve',
    areaCouncil: 'Toga Island (Torres)',
    beneficiary: '',
    ccaType: 'Marine',
    status: 'Existing',
    xCoord: null,
    yCoord: null,
    scheduledTrip: '',
    mappingStatus: 'Completed',
    hectaresTerrestrial: null,
    hectaresMarine: 69.299,
    remarks: '',
    registrationStatus: 'Registered',
  },
  {
    id: 'MPA-E02',
    name: 'East Vanualava Marine Reserve (Quanlap)',
    areaCouncil: 'East Vanualava',
    beneficiary: '',
    ccaType: 'Marine',
    status: 'Existing',
    xCoord: null,
    yCoord: null,
    scheduledTrip: '',
    mappingStatus: 'Completed',
    hectaresTerrestrial: null,
    hectaresMarine: 214.391,
    remarks: '',
    registrationStatus: 'Registered',
  },
  {
    id: 'MPA-E03',
    name: 'Hiu Island Marine Reserve',
    areaCouncil: 'Hiu Island (Torres)',
    beneficiary: '',
    ccaType: 'Marine',
    status: 'Existing',
    xCoord: null,
    yCoord: null,
    scheduledTrip: '',
    mappingStatus: '',
    hectaresTerrestrial: null,
    hectaresMarine: null,
    remarks: '',
    registrationStatus: '',
  },
]

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

/** Patch individual entry fields — corrects stale data values on load */
function patchEntry(e: ProDocEntry): ProDocEntry {
  let patched = e
  // Correct Wusi marine ha (survey revision, March 2026) — enforce regardless of
  // which stale value Firestore holds (was 111.959, also seen as 36.516)
  if (e.id === 'MTPA2403' && e.hectaresMarine !== 50.327) {
    patched = { ...patched, hectaresMarine: 50.327 }
  }
  // Always enforce Registered for confirmed new MPA entries — prevents Firestore
  // stale values (e.g. 'Not Yet Registered') from reverting the 243.69 ha total
  if (NEW_MPA_REGISTERED_IDS.has(e.id) && e.registrationStatus !== 'Registered') {
    patched = { ...patched, registrationStatus: 'Registered' as const }
  }
  return patched
}

/** Apply migration: move reclassified entries from existing → new, patch stale values,
 *  and inject missing existing MPA entries */
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

  // Inject default existing MPA entries if not already present
  const existingIds = new Set(prunedExisting.map((e) => e.id))
  const missingMpas = DEFAULT_EXISTING_MPAS.filter((e) => !existingIds.has(e.id))

  return {
    newAreas: [...newAreas, ...toAppend].map(patchEntry),
    existingAreas: [...prunedExisting, ...missingMpas],
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
