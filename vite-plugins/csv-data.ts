import fs from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const API_PATH = '/api/csv-files'

function listCsvFiles(): { name: string; content: string }[] {
  if (!fs.existsSync(DATA_DIR)) return []
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort()
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(DATA_DIR, name), 'utf-8'),
    }))
}

function csvFilesMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url !== API_PATH) return next()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(listCsvFiles()))
  }
}

export function csvDataPlugin(): Plugin {
  return {
    name: 'csv-data',
    configureServer(server) {
      server.middlewares.use(csvFilesMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(csvFilesMiddleware())
    },
  }
}
