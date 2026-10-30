import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    // Every API route is FastAPI's: `pnpm dev:api` runs it here.
    proxy: { '/api': 'http://localhost:8000' }
  },
  test: {
    environment: 'jsdom',
    // Claude Code worktrees hold whole copies of the repo, tests included.
    exclude: [...configDefaults.exclude, '.claude/**'],
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true
  }
})
