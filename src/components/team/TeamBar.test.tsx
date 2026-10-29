import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { type TeamMember } from '@/lib/team/team'
import { apiResponse, stubFetch } from '@/test/fake-api'
import { seedTeam } from '@/test/fake-server'
import { renderWithClient } from '@/test/render'
import { signIn } from '@/test/session'

import { TeamBar } from './TeamBar'

// The signed-in user's team on the (fake) server.
const save = (members: TeamMember[]) => {
  seedTeam(members)
  signIn()
}

describe('TeamBar', () => {
  it('invites you to add creatures when empty', async () => {
    signIn()
    stubFetch()
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(
      await screen.findByRole('region', { name: /Your team/ })
    ).toHaveTextContent('0/6')
    expect(
      screen.getByText(/Open a card and add a creature/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Battle/ })).toBeNull()
  })

  it('lists members with level and HP, rests and removes', async () => {
    stubFetch()
    save([
      { creatureId: 1, hp: 3, level: 5, uid: 'a', xp: 125 },
      { creatureId: 2, hp: null, level: 7, uid: 'b', xp: 343 }
    ])
    const onNotice = vi.fn()
    renderWithClient(<TeamBar onNotice={onNotice} />)
    const list = await screen.findByRole('list', { name: 'Team members' })
    expect(await within(list).findByText('Geovanni')).toBeInTheDocument()
    // Geovanni base HP 28 at Lv5 → 17 max.
    expect(list).toHaveTextContent('3/17')
    expect(list).toHaveTextContent('Lv7')
    expect(screen.getByRole('link', { name: '▶ Battle' })).toHaveAttribute(
      'href',
      '/battle'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rest' }))
    await waitFor(() => expect(list).toHaveTextContent('17/17'))
    expect(onNotice).toHaveBeenCalledWith('Your team is rested!')
    expect(screen.getByRole('button', { name: 'Rest' })).toBeDisabled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Britney from team' })
    )
    await waitFor(() => expect(within(list).queryByText('Britney')).toBeNull())
  })

  it('shows a creature that is no longer on file as missing', async () => {
    stubFetch()
    save([{ creatureId: 5000, hp: null, level: 5, uid: 'gone', xp: 125 }])
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(await screen.findByText('Missing creature')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Missing creature from team' })
    )
    expect(
      screen.getByText(/Open a card and add a creature/)
    ).toBeInTheDocument()
  })

  it('marks who goes first while pointing at Battle, and reorders', async () => {
    stubFetch()
    save([
      { creatureId: 1, hp: 0, level: 5, uid: 'a', xp: 125 },
      { creatureId: 2, hp: null, level: 5, uid: 'b', xp: 125 },
      { creatureId: 3, hp: null, level: 5, uid: 'c', xp: 125 }
    ])
    renderWithClient(<TeamBar onNotice={() => {}} />)
    const list = await screen.findByRole('list', { name: 'Team members' })
    await within(list).findByText('Hershel')
    expect(screen.queryByText('Goes first')).toBeNull()

    // Geovanni has fainted, so Britney leads.
    await userEvent.hover(screen.getByRole('link', { name: '▶ Battle' }))
    const items = () => within(list).getAllByRole('listitem')
    expect(items()[1]).toHaveTextContent('Goes first')
    await userEvent.unhover(screen.getByRole('link', { name: '▶ Battle' }))
    expect(screen.queryByText('Goes first')).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: 'Move Hershel earlier' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Move Hershel earlier' })
    )
    expect(items().map(item => item.textContent)).toEqual([
      expect.stringContaining('Hershel'),
      expect.stringContaining('Geovanni'),
      expect.stringContaining('Britney')
    ])
    expect(
      screen.getByRole('button', { name: 'Move Hershel earlier' })
    ).toBeDisabled()
    await userEvent.hover(screen.getByRole('link', { name: '▶ Battle' }))
    expect(items()[0]).toHaveTextContent('Goes first')
  })
})

describe('TeamBar errors', () => {
  it('shows why the server refused a change, and keeps the team as it was', async () => {
    save([{ creatureId: 1, hp: null, level: 5, uid: 'a', xp: 125 }])
    stubFetch((url, init) =>
      init?.method === 'PUT'
        ? Response.json(
            { error: 'Each creature can only be on the team once' },
            { status: 400 }
          )
        : apiResponse(url, init)
    )
    renderWithClient(<TeamBar onNotice={() => {}} />)
    const list = await screen.findByRole('list', { name: 'Team members' })
    await within(list).findByText('Geovanni')
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Geovanni from team' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Each creature can only be on the team once'
    )
    // Rolled back: the list (gone while the team looked empty) is back.
    const restored = screen.getByRole('list', { name: 'Team members' })
    expect(within(restored).getByText('Geovanni')).toBeInTheDocument()
  })
})

describe('TeamBar signed out', () => {
  it('asks you to sign in to build a team', async () => {
    stubFetch()
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(
      await screen.findByRole('link', { name: 'Sign in to build a team' })
    ).toHaveAttribute('href', '/login?next=%2Fexplore%23team')
  })
})

describe('TeamBar load failure', () => {
  it('offers to try loading the team again', async () => {
    save([{ creatureId: 1, hp: null, level: 5, uid: 'a', xp: 125 }])
    let fail = true
    stubFetch((url, init) => {
      if (url.pathname === '/api/team' && fail) {
        fail = false
        return Response.json({ error: 'down' }, { status: 503 })
      }
      return apiResponse(url, init)
    })
    renderWithClient(<TeamBar onNotice={() => {}} />)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Try again' })
    )
    expect(await screen.findByText('Geovanni')).toBeInTheDocument()
  })
})
