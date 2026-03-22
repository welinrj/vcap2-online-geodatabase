import { useContext } from 'react'
import { ProDocContext, type ProDocContextValue } from './proDocContextDef'

export const useProDoc = (): ProDocContextValue => {
  const ctx = useContext(ProDocContext)
  if (!ctx) throw new Error('useProDoc must be used within ProDocProvider')
  return ctx
}
