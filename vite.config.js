import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The editor lives in client/; the Express API (server/index.js) runs on :4400.
// In dev, Vite serves the React app and proxies API + media routes to Express.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4400',
      '/uploads': 'http://localhost:4400',
      '/display': 'http://localhost:4400'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
