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

  it('summarises the catalog for the landing page', async () => {
    const res = await fetch(`${base}/api/summary`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ generations: 9, total: 1000 })
  })

  it('rejects bad input with a 400', async () => {
    const res = await fetch(`${base}/api/pokemon?limit=10000`)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'limit must be an integer from 1 to 100'
    })
  })
})
