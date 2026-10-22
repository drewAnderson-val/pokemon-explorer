import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'
import { apiResponse, stubFetch } from './test/fake-api'
import { stubEventSource } from './test/fake-event-source'
import { renderWithClient } from './test/render'

afterEach(() => window.history.pushState({}, '', '/'))

describe('App', () => {
  it('renders the explorer at /explore', () => {
    window.history.pushState({}, '', '/explore')
    stubFetch()
    renderWithClient(<App />)
    expect(screen.getByLabelText('What will you look for?')).toBeInTheDocument()
  })

  it.each(['/explore', '/battle', '/create'])(
    'links back to the landing page from %s',
    path => {
      window.history.pushState({}, '', path)
      stubFetch()
      renderWithClient(<App />)
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
        'href',
        '/'
      )
      expect(
        screen.queryByRole('link', { name: '◀ Explorer' })
      ).not.toBeInTheDocument()
    }
  )

  it('renders the friend battle at /battle/vs/<id>, the wild battle at /battle', () => {
    stubEventSource()
    stubFetch(url =>
      url.pathname.endsWith('/join')
        ? Response.json({ error: 'full' }, { status: 409 })
        : apiResponse(url)
    )
    window.history.pushState({}, '', '/battle/vs/abcd2345')
    const { unmount } = renderWithClient(<App />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    unmount()

    window.history.pushState({}, '', '/battle')
    renderWithClient(<App />)
    expect(screen.getByRole('heading', { name: 'Battle' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Battle a friend' })
    ).toHaveAttribute('href', '/battle/vs')
  })

  it('renders the landing page everywhere else', () => {
    stubFetch()
    renderWithClient(<App />)
    expect(
      screen.getByRole('navigation', { name: 'Start' })
    ).toBeInTheDocument()
  })
})
