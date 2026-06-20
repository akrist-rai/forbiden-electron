import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Remove <link rel="preload" as="style"> tags that Tauri's custom protocol
    // (tauri://localhost) cannot serve — causes "Unable to preload CSS" warnings.
    {
      name: 'tauri-css-preload-fix',
      transformIndexHtml(html: string) {
        return html.replace(/<link rel="preload"[^>]*as="style"[^>]*>/g, '')
      },
    },
  ],
  server: {
    port: 5175,
    host: host || false,
    strictPort: true,
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
    // Disable JS module preloading — Tauri's tauri:// protocol rejects
    // <link rel="modulepreload"> fetches, causing console noise and stalled loads.
    modulePreload: false,
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
