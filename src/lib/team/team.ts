import type { Pokemon } from '../pokemon'

import { MAX_TEAM } from '../battle/engine'
import { maxHpAt, START_LEVEL, xpForLevel } from '../battle/stats'

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

// "Battle with X": X leads (the battle sends out the first healthy member).
// Already on the team, it moves to the front; otherwise it joins at the front
// if there's room. A full team without X comes back unchanged.
export function leadWith(team: TeamMember[], creature: Pokemon, uid: string) {
  const index = team.findIndex(member => member.creatureId === creature.id)
  if (index === 0) return team
  if (index > 0) return [team[index], ...team.filter((_, i) => i !== index)]
  return isTeamFull(team) ? team : [newMember(creature, uid), ...team]
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

// Swaps a member with its neighbour (step -1: earlier, 1: later); a move past
// either end leaves the team as it is.
export function moveMember(team: TeamMember[], uid: string, step: -1 | 1) {
  const from = team.findIndex(member => member.uid === uid)
  const to = from + step
  if (from < 0 || to < 0 || to >= team.length) return team
  const next = [...team]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export const memberMaxHp = (member: TeamMember, creature: Pokemon) =>
  maxHpAt(creature.hp, member.level)

export const memberHp = (member: TeamMember, creature: Pokemon) =>
  member.hp ?? memberMaxHp(member, creature)

export function makeUid() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
