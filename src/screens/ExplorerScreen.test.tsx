import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { apiResponse, searchParamOf, stubFetch } from '@/test/fake-api'
import { seedCreations, serverTeam } from '@/test/fake-server'
import { setIntersecting } from '@/test/intersection-observer'
import { renderWithClient } from '@/test/render'
import { signIn } from '@/test/session'

import { ExplorerScreen } from './ExplorerScreen'

// Counts below come from the committed fixture data (src/data/pokemon.json).
const grid = () => screen.getByRole('list', { name: 'Creatures' })
const cardNames = () =>
  within(grid())
    .queryAllByRole('button')
    .map(button => button.textContent)
const searchInput = () => screen.getByLabelText('What will you look for?')

async function renderLoaded() {
  const user = userEvent.setup()
  const view = renderWithClient(<ExplorerScreen />)
  await waitFor(() => expect(cardNames()).toHaveLength(20))
  return { user, ...view }
}

describe('ExplorerScreen', () => {
  it('shows custom cards from the Creature Lab under a Custom filter', async () => {
    stubFetch()
    signIn()
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
    const { user } = await renderLoaded()
    await user.click(await screen.findByRole('button', { name: 'Custom (1)' }))
    expect(cardNames()).toEqual(['Embercub'])
    expect(screen.getByText('1 result')).toBeInTheDocument()

    await user.type(searchInput(), 'zzz')
    await waitFor(() => expect(cardNames()).toEqual([]))
  })

  it('shows skeletons, then the first page and the catalog count', async () => {
    stubFetch()
    const { container } = renderWithClient(<ExplorerScreen />)
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(10)
    expect(
      await screen.findByText('1000 creatures on file')
    ).toBeInTheDocument()
    await waitFor(() => expect(cardNames()).toHaveLength(20))
    expect(cardNames()[0]).toBe('Geovanni')
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(0)
  })

  it('debounces search and announces the result count', async () => {
    const fetchMock = stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'vel')
    expect(await screen.findByText('36 results')).toBeInTheDocument()
    const searches = fetchMock.mock.calls
      .map(call => searchParamOf(call, 'search'))
      .filter(Boolean)
    expect(searches).toEqual(['vel'])
  })

  it('filters by a single type and clears with All', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    expect(
      screen.getByRole('button', { name: 'Fire', pressed: true })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'All', pressed: false })
    ).toBeInTheDocument()
    expect(await screen.findByText('71 results')).toBeInTheDocument()
    for (const card of within(grid()).getAllByRole('listitem')) {
      expect(within(card).getByText('Fire')).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() =>
      expect(screen.queryByText(/results$/)).not.toBeInTheDocument()
    )
  })

  it('sorts strongest first', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Strongest' }))
    await waitFor(() => expect(cardNames()[0]).toBe('Michaela'))
  })

  it('expands several cards independently', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    const [first, second] = within(grid()).getAllByRole('button')
    await user.click(first)
    await user.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    await user.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps loading while the sentinel stays in view, then shows the end', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'ber')
    expect(await screen.findByText('67 results')).toBeInTheDocument()
    act(() => setIntersecting(true))
    expect(
      await screen.findByText("That's every creature on file!")
    ).toBeInTheDocument()
    expect(cardNames()).toHaveLength(67)
  })

  it('shows the empty state and clears filters', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'zzzz')
    expect(
      await screen.findByText('But nothing appeared! Try another type.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(searchInput()).toHaveValue('')
    await waitFor(() => expect(cardNames()).toHaveLength(20))
  })

  it('keeps loaded cards when the next page fails and retries that page', async () => {
    let failNext = true
    const fetchMock = stubFetch(url => {
      if (url.searchParams.get('page') === '2' && failNext) {
        failNext = false
        return new Response('boom', { status: 500 })
      }
      return apiResponse(url)
    })
    const { user } = await renderLoaded()
    act(() => setIntersecting(true))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection fled! Try again.'
    )
    expect(cardNames()).toHaveLength(20)
    act(() => setIntersecting(false))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toHaveLength(40))
    const pages = fetchMock.mock.calls
      .filter(call => searchParamOf(call, 'limit') === '20')
      .map(call => searchParamOf(call, 'page'))
    expect(pages).toEqual(['1', '2', '2'])
  })

  it('retries a failed first page', async () => {
    let failNext = true
    stubFetch(url => {
      if (url.searchParams.get('limit') === '20' && failNext) {
        failNext = false
        return new Response('boom', { status: 500 })
      }
      return apiResponse(url)
    })
    const user = userEvent.setup()
    renderWithClient(<ExplorerScreen />)
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardNames()).toHaveLength(20))
  })

  it('ignores a slower response for an older search', async () => {
    const pending: (() => void)[] = []
    const fetchMock = stubFetch(url =>
      url.searchParams.get('search') === 'fi'
        ? new Promise<Response>(resolve =>
            pending.push(() => resolve(apiResponse(url)))
          )
        : apiResponse(url)
    )
    const { user } = await renderLoaded()
    await user.type(searchInput(), 'fi')
    await waitFor(() => expect(pending).toHaveLength(1))
    await user.type(searchInput(), 're')
    expect(await screen.findByText('71 results')).toBeInTheDocument()
    act(() => pending[0]())
    const olderCall = fetchMock.mock.calls.find(
      call => searchParamOf(call, 'search') === 'fi'
    )
    expect(olderCall?.[1]?.signal?.aborted).toBe(true)
    expect(screen.getByText('71 results')).toBeInTheDocument()
  })

  it('clears filters straight to the full list and refocuses search', async () => {
    const fetchMock = stubFetch()
    const { user } = await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Water' }))
    await user.type(searchInput(), 'zzzz')
    await user.click(
      await screen.findByRole('button', { name: 'Clear filters' })
    )
    expect(searchInput()).toHaveFocus()
    await waitFor(() => expect(cardNames()).toHaveLength(20))
    const staleCombo = fetchMock.mock.calls.filter(
      call =>
        searchParamOf(call, 'search') === 'zzzz' &&
        searchParamOf(call, 'type') === null
    )
    expect(staleCombo).toEqual([])
  })

  it('keeps keyboard focus near the list after retrying a page', async () => {
    let failNext = true
    stubFetch(url => {
      if (url.searchParams.get('page') === '2' && failNext) {
        failNext = false
        return new Response('boom', { status: 500 })
      }
      return apiResponse(url)
    })
    const { user } = await renderLoaded()
    act(() => setIntersecting(true))
    await screen.findByRole('alert')
    act(() => setIntersecting(false))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const lastLoaded = within(grid()).getAllByRole('button')[19]
    expect(lastLoaded).toHaveFocus()
  })

  it('adds a creature to the team from its card', async () => {
    signIn()
    stubFetch()
    const { user } = await renderLoaded()
    await user.click(within(grid()).getAllByRole('button')[0])
    await user.click(
      screen.getByRole('button', { name: 'Add Geovanni to team' })
    )
    const team = screen.getByRole('list', { name: 'Team members' })
    expect(await within(team).findByText('Geovanni')).toBeInTheDocument()
    expect(screen.getByText('Geovanni joined your team!')).toBeInTheDocument()
    await waitFor(() =>
      expect(serverTeam().map(m => m.creatureId)).toEqual([1])
    )
    expect(screen.getByRole('button', { name: 'On your team' })).toBeDisabled()
  })

  it('sends you to sign in to add a creature when signed out', async () => {
    stubFetch()
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const { user } = await renderLoaded()
    await user.click(within(grid()).getAllByRole('button')[0])
    await user.click(
      screen.getByRole('button', { name: 'Add Geovanni to team' })
    )
    expect(assign).toHaveBeenCalledWith('/login?next=%2Fexplore')
  })

  it("doesn't say a creature joined when the team hasn't loaded yet", async () => {
    signIn()
    stubFetch((url, init) =>
      url.pathname === '/api/team'
        ? new Promise<Response>(() => {})
        : apiResponse(url, init)
    )
    const { user } = await renderLoaded()
    await user.click(within(grid()).getAllByRole('button')[0])
    await user.click(
      screen.getByRole('button', { name: 'Add Geovanni to team' })
    )
    expect(screen.queryByText('Geovanni joined your team!')).toBeNull()
  })

  it('focuses search with /', async () => {
    stubFetch()
    const { user } = await renderLoaded()
    await user.keyboard('/')
    expect(searchInput()).toHaveFocus()
  })
})
