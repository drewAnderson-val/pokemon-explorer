import { authFetch, currentSession } from '../auth'
import { type TeamMember } from './team'

// The signed-in user's team, kept in sync with the API (/api/team). Screens
// read and change it through useTeam; the server decides levels, XP and HP.
export type TeamStatus = {
  error: null | string
  loaded: boolean
  members: TeamMember[]
}

const EMPTY: TeamStatus = { error: null, loaded: false, members: [] }

let status = EMPTY
const listeners = new Set<() => void>()
// The token the team was loaded for: a different (or no) user means reload.
let loadedFor: null | string = null
// What the server last confirmed, for rolling back a refused change.
let confirmed: TeamMember[] = []
// Requests run one at a time, in the order the changes were made.
let queue: Promise<void> = Promise.resolve()
// Only the newest change's answer is shown, so an older answer can't briefly
// undo a newer change that's still on its way.
let latestChange = 0

function set(next: TeamStatus) {
  status = next
  listeners.forEach(listener => listener())
}

export const teamStatus = {
  read: () => status,
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
}

class TeamError extends Error {}

// Shows the change at once, then saves it: the client sends only which creatures
// and in what order; the server's answer (uids, stats) replaces the local copy.
export function changeTeam(change: (team: TeamMember[]) => TeamMember[]) {
  if (!currentSession() || !status.loaded) return
  const next = change(status.members)
  if (next === status.members) return
  const id = ++latestChange
  set({ ...status, error: null, members: next })
  void enqueue(async () => {
    try {
      const members = await readTeam(
        await authFetch('/api/team', {
          body: JSON.stringify({
            members: next.map(m => ({ creatureId: m.creatureId, uid: m.uid }))
          }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT'
        })
      )
      confirmed = members
      if (id === latestChange) set({ ...status, members })
    } catch (error) {
      if (!(error instanceof TeamError)) throw error
      set({ ...status, error: error.message, members: confirmed })
    }
  })
}

// Loads the team for whoever is signed in now (or clears it when nobody is).
export function ensureTeamLoaded() {
  const token = currentSession()?.token ?? null
  if (token === loadedFor) return
  loadedFor = token
  confirmed = []
  set(EMPTY)
  if (token) void reloadTeam()
}

// Fetches the team again, e.g. after a battle changed it on the server.
export function reloadTeam() {
  const token = loadedFor
  return enqueue(async () => {
    const members = await readTeam(await authFetch('/api/team'))
    if (loadedFor !== token) return
    confirmed = members
    set({ error: null, loaded: true, members })
  })
}

export function resetTeamForTests() {
  status = EMPTY
  loadedFor = null
  confirmed = []
  queue = Promise.resolve()
  latestChange = 0
}

export function restTeam() {
  return enqueue(async () => {
    const members = await readTeam(
      await authFetch('/api/team/rest', { method: 'POST' })
    )
    confirmed = members
    set({ ...status, error: null, members })
  })
}

function enqueue(work: () => Promise<void>) {
  queue = queue.then(work).catch(() => {
    set({ ...status, error: 'Couldn’t reach the server', members: confirmed })
  })
  return queue
}

async function readTeam(response: Response) {
  const body = (await response.json().catch(() => null)) as null | {
    error?: string
    members?: TeamMember[]
  }
  if (!response.ok || !body?.members) {
    throw new TeamError(
      body?.error ?? `Team request failed (${response.status})`
    )
  }
  return body.members
}
