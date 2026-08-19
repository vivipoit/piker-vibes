import type { CsvFile } from '../context/CsvDataContext'

export function getRows(files: CsvFile[], name: string) {
  return files.find((f) => f.name === name)?.rows ?? []
}
