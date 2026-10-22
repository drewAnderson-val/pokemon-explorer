import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import pokemon from '@/data/pokemon.json'
import { SETTINGS_STORAGE_KEY } from '@/hooks/useSettings'
import {
  battleViewFor,
  createVersusTeam,
  resolveVersusTurn,
  versusSendOut,
  type VersusState
} from '@/lib/battle/versus'
import { type MatchAction, type MatchView } from '@/lib/versus-api'

import { VersusArena } from './VersusArena'

// Host: #1 Geovanni, #3 Hershel. Guest: #2 Britney, #4 Rasheed. All Lv50.
const byId = (id: number) => (pokemon as Pokemon[]).find(p => p.id === id)!
const rng = () => 0.5

const startState = (): VersusState => ({
  guest: createVersusTeam([byId(2), byId(4)], 'guest'),
  host: createVersusTeam([byId(1), byId(3)], 'host'),
  winner: null
})

const viewOf = (
  state: VersusState,
  extra: Partial<MatchView> = {},
  opponent: Partial<MatchView['opponent']> = {}
): MatchView => ({
  acted: false,
  battle: battleViewFor(state, 'host'),
  events: [],
  opponent: {
    acted: false,
    connected: true,
    joined: true,
    ready: true,
    standing: state.guest.party.filter(f => f.hp > 0).length,
    switching: state.guest.mustSwitch,
    ...opponent
  },
  outcome: null,
  phase: 'battle',
  ready: true,
  turn: 1,
  you: 'host',
  ...extra
})

const bothMove = (state: VersusState) =>
  resolveVersusTurn(
    state,
    {
      guest: { index: 0, timing: 1, type: 'move' },
      host: { index: 0, timing: 1, type: 'move' }
    },
    rng
  )

// The host's creature (or the guest's) is knocked out by the last turn.
const knockOut = (state: VersusState, seat: 'guest' | 'host') => {
  const next = structuredClone(state)
  next[seat].party[next[seat].active].hp = 0
  next[seat].mustSwitch = true
  return next
}

const liveRegion = () => {
  const region = document.querySelector('[aria-live="polite"]')
  if (!region) throw new Error('No live region')
  return region
}
const expectMessage = (text: RegExp | string) =>
  waitFor(() => expect(liveRegion()).toHaveTextContent(text))

// Presses Enter until the live region matches; returns every line it passed.
async function readUntil(text: RegExp | string) {
  const seen: string[] = []
  for (let i = 0; i < 40; i++) {
    const line = liveRegion().textContent
    if (line.match(text)) return seen
    seen.push(line)
    await userEvent.keyboard('{Enter}')
  }
  throw new Error(
    `Never saw ${String(text)}; last: ${liveRegion().textContent}`
  )
}

const actions = () => screen.getByRole('group', { name: 'Actions' })
const actionButton = (name: string) =>
  within(actions()).getByRole('button', { name: new RegExp(name) })

function mount(view: MatchView) {
  const send = vi.fn<(action: MatchAction) => Promise<void>>(() =>
    Promise.resolve()
  )
  const onNewMatch = vi.fn()
  const utils = render(
    <VersusArena onNewMatch={onNewMatch} send={send} view={view} />
  )
  const update = (next: MatchView) =>
    utils.rerender(
      <VersusArena onNewMatch={onNewMatch} send={send} view={next} />
    )
  return { onNewMatch, send, update }
}

beforeEach(() => {
  // Reduced motion: text appears whole, HP bars jump and there's no timing bar.
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => {},
    matches: query.includes('reduce'),
    removeEventListener: () => {}
  }))
})

afterEach(() => localStorage.clear())

describe('VersusArena', () => {
  it('opens on the friend sending out their creature, then ours', async () => {
    mount(viewOf(startState()))
    await expectMessage('Your friend sent out Britney!')
    const seen = await readUntil('What will Geovanni do?')
    expect(seen).toEqual(['Your friend sent out Britney!', 'Go! Geovanni!'])
    expect(actionButton('Fight')).toBeEnabled()
    expect(actionButton('Team')).toBeEnabled()
    expect(actionButton('Forfeit')).toBeEnabled()
  })

  it('sends a move with the reduced-motion bonus, then waits', async () => {
    const state = startState()
    const { send, update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    await userEvent.click(actionButton('Fight'))
    const first = state.host.party[0].moves[0].name
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(first) })
    )
    expect(send).toHaveBeenCalledWith({ index: 0, timing: 1.125, type: 'move' })
    await expectMessage('Waiting for your friend…')
    // The server says so too.
    update(viewOf(state, { acted: true }))
    expect(actionButton('Fight')).toBeDisabled()
    await userEvent.click(actionButton('Fight'))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('plays a resolved turn and comes back to the menu', async () => {
    const state = startState()
    const { update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    const turn = bothMove(state)
    update(viewOf(turn.state, { events: turn.events, turn: 2 }))
    await expectMessage(/used .+!/)
    const seen = await readUntil('What will Geovanni do?')
    expect(seen.some(line => /^Geovanni used .+!$/.test(line))).toBe(true)
    expect(seen.some(line => /^Foe Britney used .+!$/.test(line))).toBe(true)
    expect(actionButton('Fight')).toBeEnabled()
  })

  it('queues a turn that arrives mid-messages until they finish', async () => {
    const state = startState()
    const { update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    const second = bothMove(state)
    update(viewOf(second.state, { events: second.events, turn: 2 }))
    await expectMessage(/used .+!/)
    const third = bothMove(second.state)
    update(viewOf(third.state, { events: third.events, turn: 3 }))
    // Still on turn 2's first line.
    expect(liveRegion()).toHaveTextContent(/used .+!/)
    const seen = await readUntil('What will Geovanni do?')
    const used = seen.filter(line => /used .+!$/.test(line))
    expect(used).toHaveLength(4)
  })

  it("doesn't replay old turns after a reload", async () => {
    const state = bothMove(bothMove(startState()).state)
    mount(viewOf(state.state, { events: state.events, turn: 5 }))
    const seen = await readUntil('What will Geovanni do?')
    expect(seen).toEqual(['Your friend sent out Britney!', 'Go! Geovanni!'])
  })

  it('waits while the friend sends out another creature', async () => {
    const state = startState()
    const fainted = knockOut(state, 'guest')
    const { update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    update(
      viewOf(fainted, {
        events: [{ side: 'enemy', type: 'faint' }],
        turn: 2
      })
    )
    await expectMessage('Foe Britney fainted!')
    await readUntil('Waiting for your friend…')
    expect(actionButton('Fight')).toBeDisabled()
    const sent = versusSendOut(fainted, 'guest', 1)
    update(viewOf(sent.state, { events: sent.events, turn: 3 }))
    await expectMessage('Your friend sent out Rasheed!')
    await readUntil('What will Geovanni do?')
    expect(actionButton('Fight')).toBeEnabled()
  })

  it('sends out a creature after a faint, and switches from the menu', async () => {
    const state = startState()
    const { send, update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    await userEvent.click(actionButton('Team'))
    await userEvent.click(screen.getByRole('button', { name: /Hershel/ }))
    expect(send).toHaveBeenLastCalledWith({ to: 1, type: 'switch' })

    const fainted = knockOut(state, 'host')
    update(
      viewOf(fainted, {
        events: [{ side: 'player', type: 'faint' }],
        turn: 2
      })
    )
    await expectMessage('Geovanni fainted!')
    await readUntil('Who will you send out?')
    await userEvent.click(screen.getByRole('button', { name: /Hershel/ }))
    expect(send).toHaveBeenLastCalledWith({ to: 1, type: 'sendOut' })
  })

  it('lets the player try again when a send fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = startState()
    const { send } = mount(viewOf(state))
    send.mockRejectedValueOnce(new Error('Could not send that move (409)'))
    await readUntil('What will Geovanni do?')
    await userEvent.click(actionButton('Forfeit'))
    await userEvent.click(actionButton('Forfeit'))
    expect(send).toHaveBeenCalledWith({ type: 'forfeit' })
    await waitFor(() => expect(actionButton('Fight')).toBeEnabled())
    expect(error).toHaveBeenCalled()
    await expectMessage('What will Geovanni do?')
    error.mockRestore()
  })

  it('asks before forfeiting, and forgets after another action', async () => {
    const { send } = mount(viewOf(startState()))
    await readUntil('What will Geovanni do?')
    await userEvent.click(actionButton('Forfeit'))
    expect(send).not.toHaveBeenCalled()
    expect(actionButton('Forfeit')).toHaveAccessibleName('Forfeit? Tap again')

    await userEvent.click(actionButton('Fight'))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(actionButton('Forfeit')).toHaveAccessibleName('Forfeit')
    await userEvent.click(actionButton('Forfeit'))
    expect(send).not.toHaveBeenCalled()
    await userEvent.click(actionButton('Forfeit'))
    expect(send).toHaveBeenCalledWith({ type: 'forfeit' })
  })

  it('keeps Forfeit available while waiting for the friend', async () => {
    const state = startState()
    const { send, update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    update(viewOf(state, { acted: true }))
    await expectMessage('Waiting for your friend…')
    expect(actionButton('Fight')).toBeDisabled()
    expect(actionButton('Team')).toBeDisabled()
    expect(actionButton('Forfeit')).toBeEnabled()
    await userEvent.click(actionButton('Forfeit'))
    await userEvent.click(actionButton('Forfeit'))
    expect(send).toHaveBeenCalledWith({ type: 'forfeit' })
  })

  it('ends at once when the friend leaves', async () => {
    const state = startState()
    const { onNewMatch, update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    update(
      viewOf(state, {
        outcome: { reason: 'left', winner: 'you' },
        phase: 'over'
      })
    )
    expect(await screen.findByText('You won!')).toBeInTheDocument()
    expect(screen.getByText('Your friend left the battle.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New match' }))
    expect(onNewMatch).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('says so when the player was away too long', async () => {
    mount(
      viewOf(startState(), {
        outcome: { reason: 'left', winner: 'them' },
        phase: 'over'
      })
    )
    expect(await screen.findByText('You lost…')).toBeInTheDocument()
    expect(screen.getByText('You were away too long.')).toBeInTheDocument()
  })

  it('reopens on the send-out after a reload mid-switch', async () => {
    const fainted = knockOut(startState(), 'host')
    const { send } = mount(viewOf(fainted, { turn: 4 }))
    await expectMessage('Who will you send out?')
    expect(screen.queryByRole('button', { name: /Back/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Hershel/ }))
    expect(send).toHaveBeenCalledWith({ to: 1, type: 'sendOut' })
  })

  it('runs the timing bar even with the Timing setting off', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ classic: true, sound: false, timing: false })
    )
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: () => {},
      matches: false,
      removeEventListener: () => {}
    }))
    const state = startState()
    const { send } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    await userEvent.click(actionButton('Fight'))
    const first = state.host.party[0].moves[0].name
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(first) })
    )
    expect(
      screen.getByRole('button', { name: 'Stop the timing bar' })
    ).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['you', 'Your friend forfeited.'],
    ['them', 'You forfeited.']
  ] as const)('ends a forfeit won by %s with "%s"', async (winner, line) => {
    mount(
      viewOf(startState(), {
        outcome: { reason: 'forfeit', winner },
        phase: 'over'
      })
    )
    expect(await screen.findByText(line)).toBeInTheDocument()
  })

  it('ends a knockout only after its messages', async () => {
    const state = startState()
    const { update } = mount(viewOf(state))
    await readUntil('What will Geovanni do?')
    const won = knockOut(state, 'guest')
    won.guest.party[1].hp = 0
    won.guest.mustSwitch = false
    won.winner = 'host'
    update(
      viewOf(won, {
        events: [{ side: 'enemy', type: 'faint' }],
        outcome: { reason: 'knockout', winner: 'you' },
        phase: 'over',
        turn: 2
      })
    )
    await expectMessage('Foe Britney fainted!')
    expect(screen.queryByText('You won!')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('You won!')).toBeInTheDocument()
    expect(
      screen.getByText('Your friend is out of creatures.')
    ).toBeInTheDocument()
  })

  it('says when the friend has dropped out', async () => {
    mount(viewOf(startState(), {}, { connected: false }))
    await readUntil('Waiting for your friend to reconnect…')
  })
})
