import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { LandingScreen } from './LandingScreen'

describe('LandingScreen', () => {
  it('is a title screen: wordmark and a menu into each part of the app', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explorer' })
    ).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Title menu' })
    expect(
      within(menu)
        .getAllByRole('link')
        .map(link => [link.textContent, link.getAttribute('href')])
    ).toEqual([
      ['Start exploring', '/explore'],
      ['Battle', '/battle'],
      ['Creature Lab', '/create']
    ])
  })

  it('keeps the scenery out of the accessibility tree and the tab order', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(screen.queryAllByRole('img')).toEqual([])
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
