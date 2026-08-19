import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { csvDataPlugin } from './vite-plugins/csv-data'

export default defineConfig({
  plugins: [react(), csvDataPlugin()],
  server: {
    host: true,
    port: 5173,
  },
})
