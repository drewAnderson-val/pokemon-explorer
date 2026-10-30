import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import pokemon from '@/data/pokemon.json'
import { authStore } from '@/lib/auth'
import { battleViewFor, createVersusTeam } from '@/lib/battle/versus'
import { type MatchView } from '@/lib/versus-api'
import { apiResponse, stubFetch } from '@/test/fake-api'
import { FakeEventSource, stubEventSource } from '@/test/fake-event-source'
import { seedCreations, seedTeam, serverTeam } from '@/test/fake-server'
import { renderWithClient } from '@/test/render'
import { signIn } from '@/test/session'

import { parseMatchId, VersusScreen } from './VersusScreen'

const ID = 'abcd2345'
const creature = (id: number) => (pokemon as Pokemon[]).find(p => p.id === id)!

const view = (extra: Partial<MatchView> = {}): MatchView => ({
  acted: false,
  battle: null,
  events: [],
  opponent: {
    acted: false,
    connected: true,
    joined: true,
    ready: false,
    standing: 0,
    switching: false
  },
  outcome: null,
  phase: 'picking',
  ready: false,
  turn: 0,
  you: 'host',
  ...extra
})

// Handlers see only the URL; the init is on the mock's calls.
const matchApi = (url: URL, init?: RequestInit) => {
  if (url.pathname === '/api/matches') {
    return Response.json({ matchId: ID })
  }
  if (url.pathname.endsWith('/join')) return Response.json({ seat: 'guest' })
  if (url.pathname.startsWith('/api/matches/')) {
    return new Response(null, { status: 204 })
  }
  return apiResponse(url, init)
}

const emit = (data: MatchView) =>
  act(() => FakeEventSource.last?.emit('view', data))

beforeEach(() => {
  signIn()
  stubEventSource()
  sessionStorage.clear()
  window.history.pushState({}, '', '/battle/vs')
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('parseMatchId', () => {
  it('takes the 8-character id after /battle/vs/', () => {
    expect(parseMatchId(`/battle/vs/${ID}`)).toBe(ID)
  })

  it.each([
    '/battle/vs',
    '/battle/vs/',
    '/battle/vs/../x',
    '/battle/vs/abcd234',
    '/battle/vs/abcd2345x',
    '/battle/vs/ABCD2345',
    '/battle/vs/abcd0145'
  ])('is null for %s', path => {
    expect(parseMatchId(path)).toBeNull()
  })
})

describe('VersusScreen', () => {
  it('creates a match and moves to its URL', async () => {
    const fetchMock = stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={null} />)
    expect(screen.getByText('Battle a friend')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create match' }))

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/battle/vs/${ID}`)
    )
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === '/api/matches' && init?.method === 'POST'
      )
    ).toBe(true)
    // The host is in: the screen follows the new match's stream.
    await waitFor(() => expect(FakeEventSource.last?.url).toContain(ID))
  })

  it('shows the share link while the host waits, and copies it', async () => {
    stubFetch(matchApi)
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    renderWithClient(<VersusScreen matchId={ID} />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    emit(
      view({
        opponent: { ...view().opponent, joined: false },
        phase: 'waiting'
      })
    )

    expect(screen.getByLabelText('Match link')).toHaveValue(
      `${window.location.origin}/battle/vs/${ID}`
    )
    expect(screen.getByText('Waiting for a friend…')).toBeInTheDocument()
    // Beside the console, not on its screen.
    const link = screen.getByLabelText('Match link')
    expect(link.closest('header')).not.toBeNull()
    expect(link.closest('.battle-stage')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/battle/vs/${ID}`
    )
  })

  it('keeps the share link after the host locks in before a friend joins', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    emit(
      view({
        opponent: { ...view().opponent, joined: false },
        phase: 'waiting',
        ready: true
      })
    )
    expect(screen.getByLabelText('Match link')).toHaveValue(
      `${window.location.origin}/battle/vs/${ID}`
    )
    expect(screen.getByText('Waiting for a friend…')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for your friend to pick…')).toBeNull()
  })

  it('shows the Timing toggle as always on', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={null} />)
    const timing = screen.getByRole('button', { name: /Timing/ })
    expect(timing).toBeDisabled()
    expect(timing).toHaveAttribute('title', 'Always on in friend battles')
  })

  describe('picking', () => {
    async function renderPicking() {
      const fetchMock = stubFetch(matchApi)
      renderWithClient(<VersusScreen matchId={ID} />)
      await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
      emit(view())
      return fetchMock
    }

    it('keeps the secret, offers your Custom creatures and sends the team', async () => {
      const fetchMock = await renderPicking()
      expect(screen.getByRole('tab', { name: /custom/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'all' })).toBeInTheDocument()
      expect(
        screen.getByLabelText("Your friend's team is a secret")
      ).toBeInTheDocument()

      const before = JSON.stringify(serverTeam())
      await userEvent.click(
        await screen.findByRole('button', { name: /Britney/ })
      )
      expect(JSON.stringify(serverTeam())).toBe(before)
      await userEvent.click(screen.getByRole('button', { name: 'Start' }))

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([url]) =>
          String(url).endsWith(`/api/matches/${ID}/actions`)
        )
        expect(call).toBeDefined()
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({
          action: { creatureIds: [2], type: 'team' }
        })
      })
      expect(JSON.stringify(serverTeam())).toBe(before)
    })

    it('brings Creature Lab members of the saved team along', async () => {
      const saved = (uid: string, creatureId: number) => ({
        creatureId,
        hp: null,
        level: 5,
        uid,
        xp: 0
      })
      seedCreations([
        {
          attack: 80,
          defense: 70,
          description: 'A sleepy fox',
          generation: 10,
          height: 0.6,
          hp: 55,
          id: 1001,
          imageUrl: 'https://img.test/creatures/1001.png',
          name: 'Embercub',
          specialAttack: 90,
          specialDefense: 60,
          speed: 100,
          types: ['Fire'],
          weight: 9.5
        }
      ])
      seedTeam([saved('a', 1001), saved('b', 2)])
      signIn()
      const fetchMock = await renderPicking()
      expect(
        await screen.findByRole('tab', { name: 'Team 2/6' })
      ).toBeInTheDocument()
      expect(
        await screen.findByRole('button', { name: /Embercub/ })
      ).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Start' }))
      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([url]) =>
          String(url).endsWith(`/api/matches/${ID}/actions`)
        )
        expect(JSON.parse(String(call?.[1]?.body)).action.creatureIds).toEqual([
          1001, 2
        ])
      })
    })

    it('waits for the friend once your team is locked in', async () => {
      await renderPicking()
      emit(view({ ready: true }))
      expect(
        screen.getByText('Waiting for your friend to pick…')
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText("Your friend's team is a secret")
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: 'Choose your team' })
      ).toBeNull()
    })
  })

  it('says it is reconnecting over the match while the stream drops', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    emit(view())
    expect(screen.queryByText('Reconnecting…')).toBeNull()
    act(() => FakeEventSource.last?.fail(FakeEventSource.CONNECTING))
    expect(screen.getByText('Reconnecting…')).toHaveAttribute('role', 'status')
    // The match stays on screen underneath.
    expect(
      screen.getByLabelText("Your friend's team is a secret")
    ).toBeInTheDocument()
    emit(view())
    expect(screen.queryByText('Reconnecting…')).toBeNull()
  })

  it('hands a started battle to the arena', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    const state = {
      guest: createVersusTeam([creature(2)], 'guest'),
      host: createVersusTeam([creature(1)], 'host'),
      winner: null
    }
    emit(
      view({
        battle: battleViewFor(state, 'host'),
        phase: 'battle',
        ready: true,
        turn: 1
      })
    )
    expect(
      await screen.findByRole('region', { name: 'Battle' })
    ).toHaveTextContent('Your friend sent out Britney!')
  })

  it('says the match is full when joining answers 409', async () => {
    stubFetch((url, init) =>
      url.pathname.endsWith('/join')
        ? Response.json({ error: 'full' }, { status: 409 })
        : apiResponse(url, init)
    )
    renderWithClient(<VersusScreen matchId={ID} />)
    expect(
      await screen.findByText('This match is already full.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /battle/i })).toHaveAttribute(
      'href',
      '/battle'
    )
  })

  it('says the match is over when the server reports it gone', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    act(() => FakeEventSource.last?.emit('gone'))
    expect(
      screen.getByText('This match has ended or expired.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New match' })).toHaveAttribute(
      'href',
      '/battle/vs'
    )
  })

  it('keeps the end screen when the finished match is dropped', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    const state = {
      guest: createVersusTeam([creature(2)], 'guest'),
      host: createVersusTeam([creature(1)], 'host'),
      winner: null
    }
    emit(
      view({
        battle: battleViewFor(state, 'host'),
        outcome: { reason: 'forfeit', winner: 'you' },
        phase: 'over',
        ready: true,
        turn: 1
      })
    )
    expect(
      await screen.findByText('Your friend forfeited.')
    ).toBeInTheDocument()
    act(() => FakeEventSource.last?.emit('gone'))
    expect(screen.getByText('Your friend forfeited.')).toBeInTheDocument()
    expect(screen.queryByText('This match has ended or expired.')).toBeNull()
  })

  it('says the match is open in another tab when replaced', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    emit(view())
    act(() => FakeEventSource.last?.emit('replaced'))
    expect(
      screen.getByText('This match is open in another tab.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to Battle' })
    ).toHaveAttribute('href', '/battle')
  })

  it('offers a retry when the server cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    stubFetch((url, init) =>
      url.pathname.endsWith('/join')
        ? broken
          ? Response.json({ error: 'boom' }, { status: 500 })
          : Response.json({ seat: 'guest' })
        : apiResponse(url, init)
    )
    renderWithClient(<VersusScreen matchId={ID} />)
    expect(
      await screen.findByText("Couldn't reach the server.")
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /battle/i })).toHaveAttribute(
      'href',
      '/battle'
    )

    broken = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    emit(
      view({
        opponent: { ...view().opponent, joined: false },
        phase: 'waiting'
      })
    )
    expect(screen.getByText('Waiting for a friend…')).toBeInTheDocument()
  })
})

describe('VersusScreen sign-in', () => {
  it('asks a signed-out friend to sign in, then comes back to the match', async () => {
    authStore.update(() => null)
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    expect(
      await screen.findByRole('link', { name: 'Sign in to battle a friend' })
    ).toHaveAttribute('href', `/login?next=%2Fbattle%2Fvs%2F${ID}`)
  })

  it('asks you to sign in to start a match', async () => {
    authStore.update(() => null)
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={null} />)
    expect(
      await screen.findByRole('link', { name: 'Sign in to battle a friend' })
    ).toHaveAttribute('href', '/login?next=%2Fbattle%2Fvs')
  })

  it('asks you to sign in again before creating a match if your session ends soon', async () => {
    authStore.update(() => ({
      expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
      token: 'test-token',
      user: { id: 'u1', username: 'Drew_1' }
    }))
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={null} />)
    expect(
      await screen.findByRole('link', { name: 'Sign in to battle a friend' })
    ).toHaveAttribute('href', '/login?next=%2Fbattle%2Fvs')
    expect(screen.getByText(/runs out soon/)).toBeInTheDocument()
  })

  it('asks you to sign in again when your session expires mid-match', async () => {
    stubFetch(matchApi)
    renderWithClient(<VersusScreen matchId={ID} />)
    await waitFor(() => expect(FakeEventSource.last).not.toBeNull())
    act(() => FakeEventSource.last?.emit('unauthorized'))
    expect(
      await screen.findByRole('link', { name: 'Sign in to battle a friend' })
    ).toBeInTheDocument()
  })
})
