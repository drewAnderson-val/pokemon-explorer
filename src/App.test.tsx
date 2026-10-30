import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { authStore } from './lib/auth'
import { apiResponse, stubFetch } from './test/fake-api'
import { stubEventSource } from './test/fake-event-source'
import { renderWithClient } from './test/render'
import { signIn } from './test/session'

afterEach(() => window.history.pushState({}, '', '/'))

describe('App', () => {
  beforeEach(() => signIn())

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
    stubFetch((url, init) =>
      url.pathname.endsWith('/join')
        ? Response.json({ error: 'full' }, { status: 409 })
        : apiResponse(url, init)
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

describe('App signed out', () => {
  beforeEach(() => authStore.update(() => null))
  afterEach(() => vi.unstubAllGlobals())

  it.each(['/', '/explore', '/create', '/battle', '/battle/vs/abcd2345'])(
    'asks you to sign in first at %s',
    path => {
      window.history.pushState({}, '', path)
      stubFetch()
      renderWithClient(<App />)
      expect(
        screen.getByRole('button', { name: 'Sign in' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Create an account' })
      ).toBeInTheDocument()
    }
  )

  it('takes you where you were headed once you sign in (an invite link, say)', async () => {
    window.history.pushState({}, '', '/battle/vs/abcd2345')
    // Signed in, the match screen opens (and streams) before the page moves on.
    stubEventSource()
    stubFetch(() =>
      Response.json({
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        token: 'tok',
        user: { id: 'u2', username: 'friend' }
      })
    )
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    renderWithClient(<App />)
    await userEvent.type(screen.getByLabelText('Username'), 'friend')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(assign).toHaveBeenCalledWith('/battle/vs/abcd2345')
  })
})
