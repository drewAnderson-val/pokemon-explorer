import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { currentSession, type Session } from '@/lib/auth'
import { stubFetch } from '@/test/fake-api'

import { LoginScreen, safeNext } from './LoginScreen'

const SESSION: Session = {
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  token: 'tok',
  user: { id: 'u1', username: 'Drew_1' }
}

async function fillIn(username: string, password: string) {
  await userEvent.type(screen.getByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

function stubNavigation() {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  return assign
}

describe('LoginScreen', () => {
  it('signs in and goes to the page it came from', async () => {
    const fetchMock = stubFetch(() => Response.json(SESSION))
    const assign = stubNavigation()
    render(<LoginScreen next="/battle" />)

    await fillIn('Drew_1', 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/login')
    expect(currentSession()?.user.username).toBe('Drew_1')
    expect(assign).toHaveBeenCalledWith('/battle')
  })

  it('shows the API message when sign-in fails', async () => {
    stubFetch(() =>
      Response.json({ error: 'Wrong username or password' }, { status: 401 })
    )
    stubNavigation()
    render(<LoginScreen next={null} />)

    await fillIn('Drew_1', 'nope-nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wrong username or password'
    )
  })

  it('creates an account', async () => {
    const fetchMock = stubFetch(() => Response.json(SESSION, { status: 201 }))
    const assign = stubNavigation()
    render(<LoginScreen next={null} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Create an account' })
    )
    await fillIn('Drew_1', 'correct horse')
    await userEvent.click(
      screen.getByRole('button', { name: 'Create account' })
    )

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/auth/signup')
    expect(assign).toHaveBeenCalledWith('/')
  })
})

describe('safeNext', () => {
  it.each([
    ['/battle', '/battle'],
    ['/explore?type=fire', '/explore?type=fire'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    // Browsers drop tabs and newlines inside URLs, so these become //evil.com.
    ['/\t/evil.com', '/'],
    ['/\n/evil.com', '/'],
    ['/\t\\evil.com', '/'],
    ['javascript:alert(1)', '/'],
    [null, '/']
  ])('%s → %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected)
  })
})
