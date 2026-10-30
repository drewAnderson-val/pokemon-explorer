// The team, wild-battle and creature API (api/app/routes/team.py, wild.py,
// creatures.py) in memory, for
// UI tests. It follows the real routes' contract: the client chooses members and
// order only; battles run on the "server" with the same engine and rng order.
import pokemonData from '@/data/pokemon.json'
import {
  type BattleState,
  clampTiming,
  createBattle,
  createFighter,
  MAX_TEAM,
  type PlayerAction,
  resolveTurn,
  type Rng,
  sendOut,
  wildLevel
} from '@/lib/battle/engine'
import { START_LEVEL, xpForLevel } from '@/lib/battle/stats'
import { type Pokemon } from '@/lib/pokemon'
import { saveBattle, type TeamMember } from '@/lib/team/team'

import { parseCreatureRequest, rollCreature } from './fake-lab'

const pokemon = pokemonData as Pokemon[]
const byId = new Map(pokemon.map(p => [p.id, p]))

type Battle = { state: BattleState; turn: number }

let members: TeamMember[] = []
let battle: Battle | null = null
let nextUid = 1
// The signed-in user's Creature Lab creatures (ids from 1001, never reused).
let creations: Pokemon[] = []
let nextCreatureId = 1001
// A test sets this to make POST /api/creatures fail with that status and message.
let labFailure: null | { message: string; status: number } = null
// The server's random numbers; tests that care script them.
export let serverRng: Rng = Math.random

export function resetFakeServer() {
  members = []
  battle = null
  nextUid = 1
  serverRng = Math.random
  creations = []
  nextCreatureId = 1001
  labFailure = null
}

export const setServerRng = (rng: Rng) => (serverRng = rng)
export const seedTeam = (team: TeamMember[]) =>
  (members = team.map(m => ({ ...m })))
export const serverTeam = () => members
export const seedCreations = (list: Pokemon[]) => {
  creations = list.map(c => ({ ...c }))
  nextCreatureId = Math.max(1000, ...list.map(c => c.id)) + 1
}
export const serverCreations = () => creations
export const failLab = (status: number, message: string) =>
  (labFailure = { message, status })

const lookup = (id: number) =>
  byId.get(id) ?? creations.find(creature => creature.id === id)
export const serverBattle = () => battle

const json = (body: unknown, status = 200) => Response.json(body, { status })
const error = (message: string, status: number) =>
  json({ error: message }, status)

// Routes /api/team… and /api/battles/wild…; anything else returns null.
export function fakeServerResponse(
  url: URL,
  init?: RequestInit
): null | Response {
  const method = (init?.method ?? 'GET').toUpperCase()
  const body =
    typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
  const signedIn = new Headers(init?.headers).has('Authorization')
  const path = url.pathname
  // Your own creature by id (the catalog's are answered by apiResponse).
  const ownId = /^\/api\/pokemon\/(\d+)$/.exec(path)
  if (ownId && Number(ownId[1]) > 1000) {
    const found = signedIn && lookup(Number(ownId[1]))
    return found ? json(found) : error(`No creature #${ownId[1]}`, 404)
  }
  if (
    !path.startsWith('/api/team') &&
    !path.startsWith('/api/battles/wild') &&
    !path.startsWith('/api/creatures')
  ) {
    return null
  }
  if (!signedIn) return error('Sign in to continue', 401)

  if (path === '/api/creatures' && method === 'GET') {
    return json({ data: [...creations].sort((a, b) => b.id - a.id) })
  }
  if (path === '/api/creatures' && method === 'POST') return makeCreature(body)
  const creatureId = /^\/api\/creatures\/(\d+)$/.exec(path)
  if (creatureId && method === 'DELETE') {
    return deleteCreature(Number(creatureId[1]))
  }

  if (path === '/api/team' && method === 'GET') return json(teamBody())
  if (path === '/api/team' && method === 'PUT') return putTeam(body)
  if (path === '/api/team/rest' && method === 'POST') {
    members = members.map(m => ({ ...m, hp: null }))
    return json(teamBody())
  }
  if (path === '/api/battles/wild' && method === 'POST') return startBattle()
  if (path === '/api/battles/wild' && method === 'GET') {
    return battle ? json(battle) : error('No battle in progress', 404)
  }
  if (path === '/api/battles/wild' && method === 'DELETE') {
    battle = null
    return new Response(null, { status: 204 })
  }
  if (path === '/api/battles/wild/actions' && method === 'POST')
    return takeTurn(body)
  return error('Not found', 404)
}

function deleteCreature(id: number) {
  if (!creations.some(creature => creature.id === id)) {
    return error(`No creature #${id}`, 404)
  }
  creations = creations.filter(creature => creature.id !== id)
  // The real table cascades: it leaves the team too.
  members = members.filter(member => member.creatureId !== id)
  return new Response(null, { status: 204 })
}

function makeCreature(body: unknown) {
  const parsed = parseCreatureRequest(body)
  if (!parsed.ok) return error(parsed.error, 400)
  if (labFailure) return error(labFailure.message, labFailure.status)
  const id = nextCreatureId++
  const creature: Pokemon = {
    ...rollCreature(
      parsed.request,
      `https://img.test/creatures/${id}.png`,
      () => 0.5
    ),
    id
  }
  creations = [...creations, creature]
  return json({ creature }, 201)
}

function putTeam(body: unknown) {
  const choices = (body as { members?: unknown })?.members
  if (!Array.isArray(choices)) return error('members is required', 400)
  if (choices.length > MAX_TEAM)
    return error(`A team is 0 to ${MAX_TEAM} creatures`, 400)
  const ids = choices.map(c => (c as { creatureId: number }).creatureId)
  if (new Set(ids).size !== ids.length) {
    return error('Each creature can only be on the team once', 400)
  }
  const missing = ids.find(id => !lookup(id))
  if (missing !== undefined) return error(`No creature #${missing}`, 400)
  const current = new Map(members.map(m => [m.uid, m]))
  members = choices.map(choice => {
    const { creatureId, uid } = choice as { creatureId: number; uid?: string }
    const kept = uid ? current.get(uid) : undefined
    return kept && kept.creatureId === creatureId
      ? kept
      : {
          creatureId,
          hp: null,
          level: START_LEVEL,
          uid: `s${nextUid++}`,
          xp: xpForLevel(START_LEVEL)
        }
  })
  return json(teamBody())
}

function startBattle() {
  if (members.length === 0)
    return error('Add a creature to your team first', 409)
  if (members.every(m => m.hp === 0))
    return error('Your team needs a rest', 409)
  // The real tables can't hold an unknown creature; seeded test teams can.
  const party = members
    .filter(m => lookup(m.creatureId))
    .map(m =>
      createFighter(lookup(m.creatureId)!, m.level, {
        hp: m.hp,
        uid: m.uid,
        xp: m.xp
      })
    )
  const taken = new Set(members.map(m => m.creatureId))
  const ids = pokemon
    .map(p => p.id)
    .filter(id => !taken.has(id))
    .sort((a, b) => a - b)
  const enemyId =
    ids[Math.min(Math.floor(serverRng() * ids.length), ids.length - 1)]
  const level = wildLevel(
    party.map(f => f.level),
    serverRng
  )
  const enemy = createFighter(byId.get(enemyId)!, level, {
    uid: `wild-${enemyId}`
  })
  battle = { state: createBattle(party, enemy), turn: 0 }
  return json(battle, 201)
}

function takeTurn(body: unknown) {
  if (!battle) return error('No battle in progress', 404)
  const { action, turn } = (body ?? {}) as {
    action?: Record<string, unknown> & { to?: number; type?: string }
    turn?: number
  }
  if (turn !== battle.turn) return error('That turn is over', 409)
  if (battle.state.winner) return error('The battle is over', 409)
  const sendingOut = action?.type === 'sendOut'
  if (battle.state.mustSwitch && !sendingOut) {
    return error('Send out another creature first', 409)
  }
  if (action?.type === 'catch' && members.length >= MAX_TEAM) {
    return error('Your team is full', 409)
  }
  try {
    const result = sendingOut
      ? sendOut(battle.state, action.to as number)
      : resolveTurn(
          battle.state,
          action?.type === 'move'
            ? ({
                ...action,
                timing: clampTiming(action.timing)
              } as PlayerAction)
            : (action as PlayerAction),
          serverRng
        )
    battle = { state: result.state, turn: battle.turn + 1 }
    members = saveBattle(members, result.state)
    return json({ ...result, turn: battle.turn })
  } catch (problem) {
    return error((problem as Error).message, 400)
  }
}

function teamBody() {
  const creatures = Object.fromEntries(
    members.map(m => [String(m.creatureId), lookup(m.creatureId)])
  )
  return { creatures, members }
}
