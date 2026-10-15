import { describe, expect, it } from 'vitest'

import { buildPrompt, parseCreatureRequest, rollCreature } from './create'
import { createWindowLimiter } from './rate-limit'

describe('parseCreatureRequest', () => {
  it('accepts a valid request and tidies the text', () => {
    expect(
      parseCreatureRequest({
        description: '  a "tiny"\ndragon  ',
        name: ' Embercub ',
        types: ['Fire', 'Fire']
      })
    ).toEqual({
      ok: true,
      request: {
        description: 'a tiny dragon',
        name: 'Embercub',
        types: ['Fire']
      }
    })
  })

  it.each([
    [null, 'body must be a JSON object'],
    [{ types: ['Fire'] }, 'name is required'],
    [{ name: '   ', types: ['Fire'] }, 'name is required'],
    [
      { name: 'x'.repeat(31), types: ['Fire'] },
      'name must be at most 30 characters'
    ],
    [{ name: 'A', types: [] }, 'types must list 1 to 2 types'],
    [
      { name: 'A', types: ['Fire', 'Water', 'Ice'] },
      'types must list 1 to 2 types'
    ],
    [{ name: 'A', types: ['Lava'] }, 'unknown type: Lava'],
    [
      { description: 5, name: 'A', types: ['Fire'] },
      'description must be a string'
    ],
    [
      { description: 'x'.repeat(201), name: 'A', types: ['Fire'] },
      'description must be at most 200 characters'
    ]
  ])('rejects %j', (body, error) => {
    expect(parseCreatureRequest(body)).toEqual({ error, ok: false })
  })
})

describe('buildPrompt', () => {
  it('quotes the user fields inside a fixed style', () => {
    const prompt = buildPrompt({
      description: 'a tiny dragon',
      name: 'Embercub',
      types: ['Fire', 'Dragon']
    })
    expect(prompt).toContain('Name: "Embercub".')
    expect(prompt).toContain('Type: Fire/Dragon.')
    expect(prompt).toContain('Concept: "a tiny dragon".')
    expect(prompt).toContain('No text')
  })

  it('leaves out the concept when there is no description', () => {
    expect(
      buildPrompt({ description: '', name: 'A', types: ['Ice'] })
    ).not.toContain('Concept')
  })
})

describe('rollCreature', () => {
  it('rolls stats within range and fills a default description', () => {
    const low = rollCreature(
      { description: '', name: 'A', types: ['Ice'] },
      'data:x',
      () => 0
    )
    const high = rollCreature(
      { description: '', name: 'A', types: ['Ice'] },
      'data:x',
      () => 0.999
    )
    expect(low).toMatchObject({ attack: 20, height: 0.3, hp: 30, weight: 1 })
    expect(high).toMatchObject({
      attack: 150,
      height: 3,
      hp: 150,
      weight: 149.9
    })
    expect(low.description).toBe('A newly discovered Ice-type creature.')
    expect(low.imageUrl).toBe('data:x')
  })
})

describe('createWindowLimiter', () => {
  it('allows up to the limit per key, then resets after the window', () => {
    let time = 0
    const limiter = createWindowLimiter(2, 1000, () => time)
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([
      true,
      true,
      false
    ])
    expect(limiter.take('b')).toBe(true)
    time = 1000
    expect(limiter.take('a')).toBe(true)
  })
})
