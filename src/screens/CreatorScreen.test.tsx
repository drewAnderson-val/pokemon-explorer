import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import { teamStatus } from '@/lib/team/serverTeam'
import { apiResponse, stubFetch } from '@/test/fake-api'
import {
  failLab,
  seedCreations,
  seedTeam,
  serverCreations,
  serverTeam
} from '@/test/fake-server'
import { renderWithClient } from '@/test/render'
import { signIn } from '@/test/session'

import { CreatorScreen } from './CreatorScreen'

const creature = (id: number, name = 'Embercub'): Pokemon => ({
  attack: 80,
  defense: 70,
  description: 'A sleepy fox',
  generation: 10,
  height: 0.6,
  hp: 55,
  id,
  imageUrl: `https://img.test/creatures/${id}.png`,
  isLegendary: false,
  name,
  specialAttack: 90,
  specialDefense: 60,
  speed: 100,
  types: ['Fire'],
  weight: 9.5
})

beforeEach(() => signIn())

async function createEmbercub() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Name'), 'Embercub')
  await user.click(screen.getByRole('button', { name: 'Fire' }))
  await user.type(screen.getByLabelText(/Description/), 'A sleepy fox')
  await user.click(screen.getByRole('button', { name: 'Create' }))
  return user
}

describe('CreatorScreen', () => {
  it('sends the form with your token and shows the creation the server made', async () => {
    const fetchMock = stubFetch()
    renderWithClient(<CreatorScreen />)
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    await createEmbercub()

    const card = await screen.findByRole('article')
    expect(
      within(card).getByRole('img', { name: 'Generated artwork of Embercub' })
    ).toHaveAttribute('src', 'https://img.test/creatures/1001.png')
    expect(within(card).getByText('No.1001')).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: 'Download' })
    ).toHaveAttribute('href', 'https://img.test/creatures/1001.png')

    const [, init] = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/creatures') && init?.method === 'POST'
    )!
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-token'
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      description: 'A sleepy fox',
      name: 'Embercub',
      types: ['Fire']
    })
    expect(serverCreations().map(c => c.name)).toEqual(['Embercub'])
  })

  it('a new account starts with an empty lab', async () => {
    stubFetch()
    renderWithClient(<CreatorScreen />)
    expect(
      await screen.findByText(/Your cards will appear here/)
    ).toBeInTheDocument()
  })

  it('shows your creatures from your account, newest on top, and deals new ones on top', async () => {
    seedCreations([creature(1001, 'Oldie'), creature(1002, 'Newer')])
    stubFetch()
    renderWithClient(<CreatorScreen />)

    const card = () => screen.getByRole('article')
    expect(await screen.findByText('1 of 2')).toBeInTheDocument()
    expect(within(card()).getByText('Newer')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Older card' }))
    expect(within(card()).getByText('Oldie')).toBeInTheDocument()

    await createEmbercub()
    expect(await screen.findByText('1 of 3')).toBeInTheDocument()
    expect(within(card()).getByText('Embercub')).toBeInTheDocument()
    expect(within(card()).getByText('No.1003')).toBeInTheDocument()
  })

  it('deletes a creature from your account, and from your team', async () => {
    seedCreations([creature(1001)])
    seedTeam([{ creatureId: 1001, hp: null, level: 5, uid: 's1', xp: 125 }])
    stubFetch()
    renderWithClient(<CreatorScreen />)
    const card = await screen.findByRole('article')
    await userEvent.click(
      within(card).getByRole('button', { name: 'Delete Embercub' })
    )
    await waitFor(() => expect(serverCreations()).toEqual([]))
    expect(serverTeam()).toEqual([])
    // The team in this browser drops it too (it reloads from the server).
    await waitFor(() => expect(teamStatus.read().members).toEqual([]))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it("keeps a creature the server won't delete, and says why", async () => {
    seedCreations([creature(1001)])
    let answer: () => void = () => {}
    stubFetch(async (url, init) => {
      if (init?.method !== 'DELETE') return apiResponse(url, init)
      await new Promise<void>(resolve => (answer = resolve))
      return Response.json(
        { error: 'That creature is in a friend match' },
        { status: 409 }
      )
    })
    renderWithClient(<CreatorScreen />)
    const card = await screen.findByRole('article')
    await userEvent.click(
      within(card).getByRole('button', { name: 'Delete Embercub' })
    )
    // Gone at once, while the server thinks about it…
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    answer()
    // …then back when it refuses.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That creature is in a friend match'
    )
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('adds a creature to your team, and links to a battle with it', async () => {
    seedCreations([creature(1001)])
    stubFetch()
    renderWithClient(<CreatorScreen />)
    const card = await screen.findByRole('article')
    expect(
      within(card).getByRole('link', { name: 'Battle with Embercub' })
    ).toHaveAttribute('href', '/battle?id=1001')
    const add = await within(card).findByRole('button', {
      name: 'Add Embercub to team'
    })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)
    await waitFor(() =>
      expect(serverTeam().map(m => m.creatureId)).toEqual([1001])
    )
    expect(
      await within(card).findByRole('button', { name: 'On your team' })
    ).toBeDisabled()
  })

  it('keeps + Team off until your team has loaded', async () => {
    seedCreations([creature(1001)])
    let release = () => {}
    const loaded = new Promise<void>(resolve => (release = resolve))
    stubFetch(async (url, init) => {
      if (url.pathname === '/api/team' && (init?.method ?? 'GET') === 'GET') {
        await loaded
      }
      return apiResponse(url, init)
    })
    renderWithClient(<CreatorScreen />)
    const card = await screen.findByRole('article')
    const add = within(card).getByRole('button', { name: /to team/ })
    expect(add).toBeDisabled()
    release()
    await waitFor(() =>
      expect(
        within(card).getByRole('button', { name: 'Add Embercub to team' })
      ).toBeEnabled()
    )
  })

  it('says why the server refused a team change', async () => {
    seedCreations([creature(1001)])
    stubFetch((url, init) =>
      url.pathname === '/api/team' && init?.method === 'PUT'
        ? Response.json(
            { error: 'That creature is not yours' },
            { status: 400 }
          )
        : apiResponse(url, init)
    )
    renderWithClient(<CreatorScreen />)
    const card = await screen.findByRole('article')
    const add = await within(card).findByRole('button', {
      name: 'Add Embercub to team'
    })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That creature is not yours'
    )
  })

  it('allows at most two types', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderWithClient(<CreatorScreen />)

    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(screen.getByRole('button', { name: 'Ice' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(screen.getByRole('button', { name: 'Ice' })).toBeEnabled()
  })

  it("shows the API's error message", async () => {
    failLab(429, "You've made a lot of creatures! Try again in an hour.")
    stubFetch()
    renderWithClient(<CreatorScreen />)
    await createEmbercub()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You've made a lot of creatures! Try again in an hour."
    )
  })
})
