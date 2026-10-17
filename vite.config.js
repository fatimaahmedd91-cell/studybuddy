import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { insightApi } from './server/insightApi.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The '' prefix loads every variable from .env.local, not just VITE_ ones.
  // GEMINI_API_KEY has no VITE_ prefix, so Vite never puts it in the browser code.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), insightApi(env)],
  }
})
