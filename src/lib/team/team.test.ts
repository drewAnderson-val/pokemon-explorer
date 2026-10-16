import { describe, expect, it } from 'vitest'

import { createBattle, MAX_TEAM } from '@/lib/battle/engine'
import { makeCreature, makeFighter } from '@/test/battle'

import {
  addMember,
  hasCreature,
  leadWith,
  memberHp,
  newMember,
  parseTeam,
  removeMember,
  restAll,
  saveBattle,
  serializeTeam,
  type TeamMember
} from './team'

const member = (uid: string, extra: Partial<TeamMember> = {}): TeamMember => ({
  creatureId: 1,
  hp: null,
  level: 5,
  uid,
  xp: 125,
  ...extra
})

describe('team model', () => {
  it('starts new members at Lv5 with full HP', () => {
    expect(newMember(makeCreature({ id: 7 }), 'u1')).toEqual({
      creatureId: 7,
      hp: null,
      level: 5,
      uid: 'u1',
      xp: 125
    })
    expect(memberHp(member('a'), makeCreature())).toBe(25)
    expect(memberHp(member('a', { hp: 3 }), makeCreature())).toBe(3)
  })

  it('adds up to six, removes by uid and rests everyone', () => {
    let team: TeamMember[] = []
    for (let i = 0; i < MAX_TEAM + 2; i++) {
      team = addMember(team, member(`m${i}`, { creatureId: i + 1, hp: 0 }))
    }
    expect(team).toHaveLength(MAX_TEAM)
    team = removeMember(team, 'm0')
    expect(team.map(m => m.uid)).not.toContain('m0')
    expect(restAll(team).every(m => m.hp === null)).toBe(true)
  })

  it('leads with the picked creature: moves it up, adds it, or leaves a full team', () => {
    const pick = makeCreature({ id: 9 })
    const team = [
      member('a', { creatureId: 1 }),
      member('b', { creatureId: 9 }),
      member('c', { creatureId: 3 })
    ]
    expect(leadWith(team, pick, 'new').map(m => m.uid)).toEqual(['b', 'a', 'c'])
    const leading = leadWith(team, pick, 'new')
    expect(leadWith(leading, pick, 'x')).toBe(leading)

    const other = [member('a', { creatureId: 1 })]
    expect(
      leadWith(other, pick, 'new').map(m => [m.uid, m.creatureId])
    ).toEqual([
      ['new', 9],
      ['a', 1]
    ])

    const full = Array.from({ length: MAX_TEAM }, (_, i) =>
      member(`m${i}`, { creatureId: i + 20 })
    )
    expect(leadWith(full, pick, 'new')).toBe(full)
  })

  it("won't add a creature that's already on the team", () => {
    const team = [member('a', { creatureId: 7 })]
    expect(addMember(team, member('b', { creatureId: 7 }))).toBe(team)
    expect(hasCreature(team, 7)).toBe(true)
    expect(hasCreature(team, 8)).toBe(false)
  })

  it('saves battle HP, XP and levels back by uid', () => {
    const fighter = { ...makeFighter({}, 7, { uid: 'a' }), hp: 4, xp: 400 }
    const state = createBattle(
      [fighter],
      makeFighter({ id: 2 }, 5, { uid: 'wild-1' })
    )
    expect(saveBattle([member('a'), member('b')], state)).toEqual([
      { creatureId: 1, hp: 4, level: 7, uid: 'a', xp: 400 },
      member('b')
    ])
  })

  it('adds a caught creature once, even if saved twice', () => {
    const wild = { ...makeFighter({ id: 2 }, 5, { uid: 'wild-1' }), hp: 3 }
    const state = {
      ...createBattle([makeFighter({}, 5, { uid: 'a' })], wild),
      caught: true
    }
    const once = saveBattle([member('a')], state)
    const twice = saveBattle(once, state)
    expect(twice).toHaveLength(2)
    expect(twice[1]).toEqual({
      creatureId: 2,
      hp: 3,
      level: 5,
      uid: 'wild-1',
      xp: 125
    })
  })
})

describe('parseTeam', () => {
  it('round-trips a saved team', () => {
    const team = [member('a', { hp: 2 })]
    expect(parseTeam(serializeTeam(team))).toEqual(team)
  })

  it.each([
    ['missing', null],
    ['not JSON', '{oops'],
    ['wrong version', JSON.stringify({ members: [], version: 99 })],
    ['not an object', '42'],
    ['members not a list', JSON.stringify({ members: {}, version: 1 })]
  ])('returns an empty team when %s', (_, raw) => {
    expect(parseTeam(raw)).toEqual([])
  })

  it('keeps only the first copy of a creature or uid', () => {
    const raw = serializeTeam([
      member('a', { creatureId: 1 }),
      member('b', { creatureId: 1 }),
      member('a', { creatureId: 2 }),
      member('c', { creatureId: 3 })
    ])
    expect(parseTeam(raw).map(m => m.uid)).toEqual(['a', 'c'])
  })

  it('drops malformed members and keeps at most six', () => {
    const good = member('ok')
    const raw = JSON.stringify({
      members: [
        good,
        { ...good, uid: '' },
        { ...good, level: 0 },
        { ...good, creatureId: 'x' },
        { ...good, hp: -1 },
        ...Array.from({ length: 8 }, (_, i) =>
          member(`n${i}`, { creatureId: i + 10 })
        )
      ],
      version: 1
    })
    const team = parseTeam(raw)
    expect(team[0]).toEqual(good)
    expect(team).toHaveLength(MAX_TEAM)
  })
})
