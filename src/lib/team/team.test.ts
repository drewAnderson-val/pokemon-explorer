import { describe, expect, it } from 'vitest'

import { MAX_TEAM } from '@/lib/battle/engine'
import { makeCreature } from '@/test/battle'

import {
  addMember,
  hasCreature,
  leadWith,
  memberHp,
  moveMember,
  newMember,
  removeMember,
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

  it('adds up to six and removes by uid', () => {
    let team: TeamMember[] = []
    for (let i = 0; i < MAX_TEAM + 2; i++) {
      team = addMember(team, member(`m${i}`, { creatureId: i + 1, hp: 0 }))
    }
    expect(team).toHaveLength(MAX_TEAM)
    team = removeMember(team, 'm0')
    expect(team.map(m => m.uid)).not.toContain('m0')
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
})

describe('moveMember', () => {
  const team = [member('a'), member('b'), member('c')]
  const uids = (members: TeamMember[]) => members.map(m => m.uid)

  it('swaps a member with its neighbour', () => {
    expect(uids(moveMember(team, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(uids(moveMember(team, 'b', 1))).toEqual(['a', 'c', 'b'])
  })

  it('leaves the team alone past either end or for an unknown uid', () => {
    expect(moveMember(team, 'a', -1)).toBe(team)
    expect(moveMember(team, 'c', 1)).toBe(team)
    expect(moveMember(team, 'zz', 1)).toBe(team)
  })
})
