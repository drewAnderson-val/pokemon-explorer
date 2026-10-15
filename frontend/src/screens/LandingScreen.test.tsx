import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { LandingScreen } from './LandingScreen'

describe('LandingScreen', () => {
  it('has the wordmark, count and a play link into the explorer', async () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explorer' })
    ).toBeInTheDocument()
    expect(screen.getByText('Finny · Pokemon')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Start exploring' })
    ).toHaveAttribute('href', '/explore')
    expect(
      await screen.findByText('1000 creatures on file')
    ).toBeInTheDocument()
  })

  // The default blue ring is ~1.25:1 on the sky; links there need the white one.
  it('uses the sky-safe focus ring on every link over the sky', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('focus-visible:focus-ring-sky')
    }
  })

  it('tabs logo → Browse → Types → About → play, skipping scenery', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(
      screen
        .getAllByRole('link')
        .map(link => link.getAttribute('aria-label') ?? link.textContent)
    ).toEqual([
      'Pokemon Explorer home',
      'Browse',
      'Types',
      'About',
      'Start exploring'
    ])
  })
})
