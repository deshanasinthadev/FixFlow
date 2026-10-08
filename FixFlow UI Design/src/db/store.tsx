import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from './dexie'
import type { Db } from './repository'

type Store = {
  db: Db
  /** False until the IndexedDB schema is open and seed data is in place. */
  ready: boolean
  error: string | null
  /** Bumped after any write so subscribers refetch. */
  version: number
  bump: () => void
}

const StoreContext = createContext<Store | null>(null)

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    db.ready()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <StoreContext.Provider value={{ db, ready, error, version, bump }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useDb(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useDb must be used inside <DbProvider>')
  return ctx
}

/**
 * Read a list from the repository and refetch whenever `version` changes.
 * Deliberately tiny — swap for TanStack Query later if caching gets hairy.
 */
export function useQuery<T>(load: (db: Db) => Promise<T>, deps: unknown[] = []) {
  const { db: database, ready, version } = useDb()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setLoading(true)
    load(database)
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version, ...deps])

  return { data, loading, error }
}
