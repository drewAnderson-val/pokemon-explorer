/// <reference types="vitest/config" />
import type { Request, Response } from 'express'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

import app from './server/app'

// API routes served by the FastAPI service (api/) instead of Express.
const FASTAPI_PREFIX = '/api/pokemon'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      configureServer(server) {
        // Routes already moved to FastAPI fall through to the proxy below.
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith(FASTAPI_PREFIX)) next()
          // Express upgrades Node's request and response objects itself.
          else app(req as Request, res as Response, next)
        })
      },
      name: 'api-server'
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    // `pnpm dev:api` runs FastAPI here.
    proxy: { [FASTAPI_PREFIX]: 'http://localhost:8000' }
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true
  }
})
