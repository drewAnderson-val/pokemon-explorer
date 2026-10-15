import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

import app from './app'

// Bundled to dist-server/index.js; the client build lives alongside in dist/.
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist'
)

app.use(express.static(distDir))
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.warn(`Listening on http://localhost:${port}`)
})
