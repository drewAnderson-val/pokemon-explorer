import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TEAM_STORAGE_KEY } from '@/hooks/useTeam'
import { serializeTeam } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { LandingScreen } from './LandingScreen'

const startMenu = () => screen.getByRole('navigation', { name: 'Start' })

describe('LandingScreen', () => {
  it('offers three ways in: battle, the Creature Lab and your roster', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explorer' })
    ).toBeInTheDocument()
    expect(
      within(startMenu())
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/battle', '/create', '/explore#team'])
    // The header doesn't repeat the start menu: just the logo, linking home.
    expect(
      within(screen.getByRole('navigation', { name: 'Main' }))
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/'])
  })

  it('says how big your roster is, or that there is none yet', () => {
    stubFetch()
    const { unmount } = renderWithClient(<LandingScreen />)
    expect(
      within(startMenu()).getByRole('link', { name: /Load your roster/ })
    ).toHaveTextContent('No team yet')
    unmount()

    localStorage.setItem(
      TEAM_STORAGE_KEY,
      serializeTeam([
        { creatureId: 1, hp: null, level: 5, uid: 'a', xp: 125 },
        { creatureId: 2, hp: null, level: 5, uid: 'b', xp: 125 }
      ])
    )
    renderWithClient(<LandingScreen />)
    expect(
      within(startMenu()).getByRole('link', { name: /Load your roster/ })
    ).toHaveTextContent('2/6 creatures on your team.')
  })
})
