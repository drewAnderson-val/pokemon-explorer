/// <reference types="vitest/config" />
import type { Request, Response } from 'express'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

import app from './server/app'

// API routes served by the FastAPI service (api/) instead of Express.
const FASTAPI_ROUTES = [
  '/api/pokemon',
  '/api/auth',
  '/api/me',
  '/api/team',
  '/api/battles',
  '/api/matches',
  '/api/creatures',
  // Swagger UI and its spec.
  '/api/docs',
  '/api/openapi.json'
]

// Whole path segments only: /api/pokemon/7 and /api/pokemon?x go to FastAPI,
// /api/pokemonX doesn't.
const isFastApi = (url = '') =>
  FASTAPI_ROUTES.some(
    route =>
      url === route ||
      url.startsWith(`${route}/`) ||
      url.startsWith(`${route}?`)
  )

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      configureServer(server) {
        // Routes already moved to FastAPI fall through to the proxy below.
        server.middlewares.use((req, res, next) => {
          if (isFastApi(req.url)) next()
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
    proxy: Object.fromEntries(
      FASTAPI_ROUTES.map(route => [route, 'http://localhost:8000'])
    )
  },
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
    unstubGlobals: true
  }
})
