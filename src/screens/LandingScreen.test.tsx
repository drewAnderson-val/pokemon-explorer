import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { authStore } from '@/lib/auth'
import { stubFetch } from '@/test/fake-api'
import { seedTeam } from '@/test/fake-server'
import { renderWithClient } from '@/test/render'
import { signIn } from '@/test/session'

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
    // The header doesn't repeat the start menu: the logo, linking home, and
    // the account link.
    expect(
      within(screen.getByRole('navigation', { name: 'Main' }))
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/', '/login'])
  })

  it('says how big your roster is, or that there is none yet', async () => {
    stubFetch()
    const { unmount } = renderWithClient(<LandingScreen />)
    expect(
      within(startMenu()).getByRole('link', { name: /Load your roster/ })
    ).toHaveTextContent('No team yet')
    unmount()

    seedTeam([
      { creatureId: 1, hp: null, level: 5, uid: 'a', xp: 125 },
      { creatureId: 2, hp: null, level: 5, uid: 'b', xp: 125 }
    ])
    signIn()
    renderWithClient(<LandingScreen />)
    await waitFor(() =>
      expect(
        within(startMenu()).getByRole('link', { name: /Load your roster/ })
      ).toHaveTextContent('2/6 creatures on your team.')
    )
  })
})

describe('LandingScreen account link', () => {
  it('offers sign-in when signed out', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  it('shows who is signed in, and signs out', async () => {
    authStore.update(() => ({
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      token: 'tok',
      user: { id: 'u1', username: 'Drew_1' }
    }))
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(screen.getByText('Signed in as Drew_1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
