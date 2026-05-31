import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: Compile with relative asset paths for Chrome Extension compatibility
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
