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
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      external: ['node-pty'],
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor-react'
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'vendor-codemirror'
          if (id.includes('xterm')) return 'vendor-xterm'
          if (id.includes('zustand')) return 'vendor-zustand'
        },
      },
    },
  },
})
