import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Uploaded images are saved as relative /storage/... paths (local and live
  // share one database). The live gateway serves them on the same origin; in
  // development the gateway is on another port, so forward them to it.
  server: {
    port: 5173,
    proxy: { '/storage': { target: process.env.GATEWAY_URL ?? 'http://localhost:54321', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        // Charts are only needed on the reports screen, and Supabase ships a
        // sizeable client — keeping them out of the entry chunk cuts first load.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
        },
      },
    },
  },
})
