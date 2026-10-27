import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

import app from './app'

// Bundled to dist-server/index.js; the client build lives alongside in dist/.
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist'
)

// Startup probe + smoke test. Not /healthz: Cloud Run reserves paths ending in z.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// An unknown API path is a JSON 404, not the SPA's index.html with a 200.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use(express.static(distDir))
app.get('/{*splat}', (_req, res) => {
  // `root` keeps send's dotfile check off the absolute path (e.g. a checkout under ~/.something).
  res.sendFile('index.html', { root: distDir })
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.warn(`Listening on http://localhost:${port}`)
})
