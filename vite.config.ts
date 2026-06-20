import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Tauri expects a fixed origin in dev; for production it uses the file:// dist
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5175,
    host: host || false,
    strictPort: true,
    // Tauri handles the Go engine; proxy not needed in dev (engine runs as sidecar)
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
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor-react'
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'vendor-codemirror'
          if (id.includes('xterm')) return 'vendor-xterm'
          if (id.includes('zustand')) return 'vendor-zustand'
          if (id.includes('@tauri-apps')) return 'vendor-tauri'
        },
      },
    },
  },
})
