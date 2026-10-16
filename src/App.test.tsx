import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'
import { stubFetch } from './test/fake-api'
import { renderWithClient } from './test/render'

afterEach(() => window.history.pushState({}, '', '/'))

describe('App', () => {
  it('renders the explorer at /explore', () => {
    window.history.pushState({}, '', '/explore')
    stubFetch()
    renderWithClient(<App />)
    expect(screen.getByLabelText('What will you look for?')).toBeInTheDocument()
  })

  it('renders the landing page everywhere else', () => {
    stubFetch()
    renderWithClient(<App />)
    expect(
      screen.getByRole('navigation', { name: 'Start' })
    ).toBeInTheDocument()
  })
})
