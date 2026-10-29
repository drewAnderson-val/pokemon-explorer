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
// Bumped whenever the signed-in user changes. Queued work remembers the
// generation it was made in and is dropped if it no longer matches, so one
// account's change is never sent with, or shown to, another account.
let generation = 0
// What the server last confirmed, for rolling back a refused change.
let confirmed: TeamMember[] = []
// Requests run one at a time, in the order the changes were made.
let queue: Promise<void> = Promise.resolve()
// Only the newest change's answer is shown, so an older answer can't briefly
// undo a newer change that's still on its way.
let latestChange = 0

class TeamError extends Error {}

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

// Shows the change at once, then saves it: the client sends only which creatures
// and in what order; the server's answer (uids, stats) replaces the local copy.
// Returns whether the change was applied (not when signed out or still loading).
export function changeTeam(
  change: (team: TeamMember[]) => TeamMember[]
): boolean {
  if (!currentSession() || !status.loaded) return false
  const next = change(status.members)
  if (next === status.members) return false
  const id = ++latestChange
  set({ ...status, error: null, members: next })
  void enqueue(async isCurrent => {
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
      if (!isCurrent()) return
      confirmed = members
      if (id === latestChange) set({ ...status, members })
    } catch (error) {
      if (!(error instanceof TeamError) || !isCurrent()) throw error
      // A newer change is still on its way; its answer will settle the team.
      if (id === latestChange) {
        set({ ...status, error: error.message, members: confirmed })
      }
    }
  })
  return true
}

// Loads the team for whoever is signed in now (or clears it when nobody is).
export function ensureTeamLoaded() {
  const token = currentSession()?.token ?? null
  if (token === loadedFor) return
  loadedFor = token
  generation++
  queue = Promise.resolve()
  latestChange = 0
  confirmed = []
  set(EMPTY)
  if (token) void reloadTeam()
}

// Fetches the team again, e.g. after a battle changed it on the server, or when
// the tab comes back into view (another tab may have changed it).
export function reloadTeam() {
  return enqueue(async isCurrent => {
    const members = await readTeam(await authFetch('/api/team'))
    if (!isCurrent()) return
    confirmed = members
    set({ error: null, loaded: true, members })
  })
}

export function resetTeamForTests() {
  status = EMPTY
  loadedFor = null
  generation++
  confirmed = []
  queue = Promise.resolve()
  latestChange = 0
}

// Heals the whole team. Resolves to whether it worked.
export async function restTeam(): Promise<boolean> {
  let rested = false
  await enqueue(async isCurrent => {
    const members = await readTeam(
      await authFetch('/api/team/rest', { method: 'POST' })
    )
    if (!isCurrent()) return
    confirmed = members
    rested = true
    set({ ...status, error: null, members })
  })
  return rested
}

// After a failed first load: try again.
export function retryTeamLoad() {
  loadedFor = null
  ensureTeamLoaded()
  return queue
}

function enqueue(work: (isCurrent: () => boolean) => Promise<void>) {
  const mine = generation
  const isCurrent = () => mine === generation
  queue = queue.then(async () => {
    // Signed out or switched accounts since this was queued: never send it.
    if (!isCurrent()) return
    try {
      await work(isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      set({
        ...status,
        error:
          error instanceof TeamError
            ? error.message
            : 'Couldn’t reach the server',
        members: confirmed
      })
    }
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
