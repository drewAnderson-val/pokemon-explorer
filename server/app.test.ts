// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from './app'

let server: Server
let base = ''

beforeAll(
  () =>
    new Promise<void>(resolve => {
      server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolve()
      })
    })
)

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

describe('GET /api/pokemon', () => {
  it('filters and sorts', async () => {
    const res = await fetch(`${base}/api/pokemon?type=fire&sort=speed&limit=5`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { speed: number; types: string[] }[]
      pagination: { total: number }
    }
    expect(body.pagination.total).toBe(71)
    expect(body.data.every(p => p.types.includes('Fire'))).toBe(true)
  })

  it('rejects bad input with a 400', async () => {
    const res = await fetch(`${base}/api/pokemon?limit=10000`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'limit must be an integer from 1 to 100'
    })
  })
})

// Builds without VITE_API_URL (pnpm start, a docker build without the arg) call
// Express for this too; the team screen loads creatures by id.
describe('GET /api/pokemon/:id', () => {
  it('returns one creature', async () => {
    const res = await fetch(`${base}/api/pokemon/7`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { id: number }).id).toBe(7)
  })

  it('answers an unknown id with a 404 error', async () => {
    const res = await fetch(`${base}/api/pokemon/5000`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No creature #5000' })
  })
})
