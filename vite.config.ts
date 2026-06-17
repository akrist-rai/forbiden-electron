import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Use './' so Electron can load assets from file:// protocol.
// VITE_BASE_PATH override still works for web deployments.
const base = process.env.VITE_BASE_PATH ?? './'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3001', ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  build: {
    // Increase chunk size limit — the app + Pyodide worker is large
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react'
          }
        },
      },
    },
  },
})
