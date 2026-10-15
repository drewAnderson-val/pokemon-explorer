import type { Pokemon } from '../pokemon'

import { type BattleState, type Fighter, MAX_TEAM } from '../battle/engine'
import { MAX_LEVEL, maxHpAt, START_LEVEL, xpForLevel } from '../battle/stats'

// Only progress is saved; names, types and stats come from the API by id.
export type TeamMember = {
  creatureId: number
  // null = full HP, so resting needs no creature data.
  hp: null | number
  level: number
  // Stable per member, so battles can save back to the right one.
  uid: string
  xp: number
}

export const TEAM_VERSION = 1

export const isTeamFull = (team: readonly TeamMember[]) =>
  team.length >= MAX_TEAM

export const hasCreature = (team: readonly TeamMember[], creatureId: number) =>
  team.some(member => member.creatureId === creatureId)

// A creature joins once: a full team or a repeat leaves the team unchanged.
export function addMember(team: TeamMember[], member: TeamMember) {
  return isTeamFull(team) || hasCreature(team, member.creatureId)
    ? team
    : [...team, member]
}

export function newMember(
  creature: Pokemon,
  uid: string,
  level = START_LEVEL
): TeamMember {
  return {
    creatureId: creature.id,
    hp: null,
    level,
    uid,
    xp: xpForLevel(level)
  }
}

export const removeMember = (team: TeamMember[], uid: string) =>
  team.filter(member => member.uid !== uid)

export const restAll = (team: TeamMember[]) =>
  team.map(member => (member.hp === null ? member : { ...member, hp: null }))

export const memberMaxHp = (member: TeamMember, creature: Pokemon) =>
  maxHpAt(creature.hp, member.level)

export const memberHp = (member: TeamMember, creature: Pokemon) =>
  member.hp ?? memberMaxHp(member, creature)

export function makeUid() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// Anything unexpected (old version, hand-edited, corrupt) becomes an empty
// team or loses just the bad members; it never throws.
export function parseTeam(raw: null | string): TeamMember[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.version !== TEAM_VERSION) return []
    if (!Array.isArray(data.members)) return []
    return data.members.filter(isMember).reduce<TeamMember[]>(
      // Older saves allowed repeats; keep the first copy of each.
      (team, member) =>
        team.some(m => m.uid === member.uid) ? team : addMember(team, member),
      []
    )
  } catch {
    return []
  }
}

// Writes a battle's HP, XP and levels back by uid, and adds a caught creature
// (once: its uid is checked, so saving after every turn is safe).
export function saveBattle(team: TeamMember[], state: BattleState) {
  const fighters = new Map(state.party.map(fighter => [fighter.uid, fighter]))
  const saved = team.map(member => {
    const fighter = fighters.get(member.uid)
    return fighter ? fromFighter(fighter) : member
  })
  const caught =
    state.caught && !saved.some(member => member.uid === state.enemy.uid)
  return caught ? addMember(saved, fromFighter(state.enemy)) : saved
}

export function serializeTeam(team: TeamMember[]) {
  return JSON.stringify({ members: team, version: TEAM_VERSION })
}

function fromFighter(fighter: Fighter): TeamMember {
  return {
    creatureId: fighter.creature.id,
    hp: fighter.hp >= fighter.maxHp ? null : fighter.hp,
    level: fighter.level,
    uid: fighter.uid,
    xp: fighter.xp
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isWhole = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min

function isMember(value: unknown): value is TeamMember {
  return (
    isRecord(value) &&
    isWhole(value.creatureId, 1) &&
    isWhole(value.level, 1) &&
    value.level <= MAX_LEVEL &&
    isWhole(value.xp, 0) &&
    typeof value.uid === 'string' &&
    value.uid !== '' &&
    (value.hp === null || isWhole(value.hp, 0))
  )
}
