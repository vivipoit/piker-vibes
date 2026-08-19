import Papa from 'papaparse'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface CsvFile {
  name: string
  rows: Record<string, string>[]
}

interface CsvDataState {
  files: CsvFile[]
  loading: boolean
  error: string | null
  reload: () => void
}

const CsvDataContext = createContext<CsvDataState | null>(null)

export function CsvDataProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<CsvFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/csv-files')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load CSV files (${res.status})`)
        return res.json() as Promise<{ name: string; content: string }[]>
      })
      .then((raw) => {
        setFiles(
          raw.map(({ name, content }) => ({
            name,
            rows: Papa.parse<Record<string, string>>(content, {
              header: true,
              skipEmptyLines: true,
            }).data,
          }))
        )
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <CsvDataContext.Provider value={{ files, loading, error, reload: load }}>
      {children}
    </CsvDataContext.Provider>
  )
}

export function useCsvData() {
  const ctx = useContext(CsvDataContext)
  if (!ctx) throw new Error('useCsvData must be used within a CsvDataProvider')
  return ctx
}
