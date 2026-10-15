// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { creaturesRoute } from './creatures-route'
import { ImageBlockedError, type ImageGenerator } from './image-generator'
import { createWindowLimiter } from './rate-limit'

const VALID = {
  description: 'a tiny dragon',
  name: 'Embercub',
  types: ['Fire']
}

let server: Server | undefined

afterEach(
  () =>
    new Promise<void>(resolve =>
      server ? server.close(() => resolve()) : resolve()
    )
)

async function start({
  generator = async () => ({ base64: 'AAAA', mimeType: 'image/png' }),
  globalLimit = 100,
  perClientLimit = 5
}: {
  generator?: ImageGenerator | null
  globalLimit?: number
  perClientLimit?: number
} = {}) {
  const app = express()
  app.use(
    creaturesRoute({
      getGenerator: () => generator,
      global: createWindowLimiter(globalLimit, 60_000),
      perClient: createWindowLimiter(perClientLimit, 60_000)
    })
  )
  const listening = app.listen(0)
  server = listening
  await new Promise(resolve => listening.once('listening', resolve))
  const base = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`
  return (body: unknown) =>
    fetch(`${base}/api/creatures`, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST'
    })
}

describe('POST /api/creatures', () => {
  it('returns a creature with the generated image', async () => {
    const generator = vi.fn<ImageGenerator>(async () => ({
      base64: 'AAAA',
      mimeType: 'image/png'
    }))
    const post = await start({ generator })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    const { creature } = (await res.json()) as {
      creature: { imageUrl: string; name: string; types: string[] }
    }
    expect(creature).toMatchObject({
      imageUrl: 'data:image/png;base64,AAAA',
      name: 'Embercub',
      types: ['Fire']
    })
    expect(generator).toHaveBeenCalledWith(expect.stringContaining('Embercub'))
  })

  it('rejects bad input with a 400 without generating', async () => {
    const generator = vi.fn<ImageGenerator>()
    const post = await start({ generator })
    const res = await post({ name: 'A', types: ['Lava'] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unknown type: Lava' })
    expect(generator).not.toHaveBeenCalled()
  })

  it('returns 503 when no generator is configured', async () => {
    const post = await start({ generator: null })
    expect((await post(VALID)).status).toBe(503)
  })

  it('limits each client, then everyone', async () => {
    const perClient = await start({ perClientLimit: 1 })
    expect((await perClient(VALID)).status).toBe(200)
    const limited = await perClient(VALID)
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({
      error: "You've made a lot of creatures! Try again in an hour."
    })
  })

  it('closes for the day at the global cap', async () => {
    const post = await start({ globalLimit: 1 })
    expect((await post(VALID)).status).toBe(200)
    const closed = await post(VALID)
    expect(closed.status).toBe(429)
    expect(await closed.json()).toEqual({
      error: 'The creature lab is closed for today. Come back tomorrow!'
    })
  })

  it('maps a safety block to 422', async () => {
    const post = await start({
      generator: () => Promise.reject(new ImageBlockedError('blocked'))
    })
    expect((await post(VALID)).status).toBe(422)
  })

  it('maps other generator failures to 502 and logs them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await start({
      generator: () => Promise.reject(new Error('quota'))
    })
    expect((await failing(VALID)).status).toBe(502)
    expect(errorSpy).toHaveBeenCalled()
  })
})
