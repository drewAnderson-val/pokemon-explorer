import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { LandingScreen } from './LandingScreen'

// Counts come from the committed fixture data via the real summary code.
describe('LandingScreen', () => {
  it('shows the real catalog numbers', async () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Explorer' })
    ).toBeInTheDocument()
    const glance = screen.getByRole('region', { name: 'At a glance' })
    expect(await within(glance).findByText('1,000')).toBeInTheDocument()
    expect(within(glance).getByText('18')).toBeInTheDocument()
    expect(within(glance).getByText('9')).toBeInTheDocument()
  })

  it('searches the explorer with a plain GET form', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    const input = screen.getByLabelText('What will you look for?')
    expect(input).toHaveAttribute('name', 'search')
    const form = input.closest('form')
    expect(form).toHaveAttribute('action', '/explore')
    expect(form).toHaveAttribute('method', 'get')
    expect(
      within(form!).getByRole('button', { name: 'Start exploring' })
    ).toHaveAttribute('type', 'submit')
  })

  it('links each type tile to a filtered explorer, with its count', async () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    const types = screen.getByRole('region', { name: 'Pick a type to start' })
    const fire = await within(types).findByRole('link', {
      name: 'Fire, 71 creatures'
    })
    expect(fire).toHaveAttribute('href', '/explore?type=Fire')
    expect(within(types).getAllByRole('listitem')).toHaveLength(18)
  })

  it('reaches every part of the app', () => {
    stubFetch()
    renderWithClient(<LandingScreen />)
    const hrefs = screen
      .getAllByRole('link')
      .map(link => link.getAttribute('href'))
    for (const href of ['/explore', '/battle', '/create', '#types']) {
      expect(hrefs).toContain(href)
    }
  })
})
