import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TEAM_STORAGE_KEY } from '@/hooks/useTeam'
import { serializeTeam, type TeamMember } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { TeamBar } from './TeamBar'

const save = (members: TeamMember[]) =>
  localStorage.setItem(TEAM_STORAGE_KEY, serializeTeam(members))

describe('TeamBar', () => {
  it('invites you to add creatures when empty', () => {
    stubFetch()
    renderWithClient(<TeamBar onNotice={() => {}} />)
    expect(screen.getByRole('region', { name: /Your team/ })).toHaveTextContent(
      '0/6'
    )
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
    const list = screen.getByRole('list', { name: 'Team members' })
    expect(await within(list).findByText('Geovanni')).toBeInTheDocument()
    // Geovanni base HP 28 at Lv5 → 17 max.
    expect(list).toHaveTextContent('3/17')
    expect(list).toHaveTextContent('Lv7')
    expect(screen.getByRole('link', { name: '▶ Battle' })).toHaveAttribute(
      'href',
      '/battle'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rest' }))
    expect(list).toHaveTextContent('17/17')
    expect(onNotice).toHaveBeenCalledWith('Your team is rested!')
    expect(screen.getByRole('button', { name: 'Rest' })).toBeDisabled()

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Britney from team' })
    )
    expect(within(list).queryByText('Britney')).toBeNull()
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
})
