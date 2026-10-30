import { type FormEvent, useId, useState } from 'react'

import { DialogBox } from '@/components/DialogBox'
import { HomeLink } from '@/components/HomeLink'
import { Button } from '@/components/ui/button'
import { login, playAsGuest, signup } from '@/lib/auth'

const field =
  'w-full min-w-0 border-b-2 border-ink bg-transparent py-1 text-body-lg outline-none placeholder:text-ink-muted focus-visible:focus-ring'

export function LoginScreen({ next }: { next: null | string }) {
  const [mode, setMode] = useState<'create' | 'signIn'>('signIn')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<null | string>(null)
  const [busy, setBusy] = useState(false)
  const usernameId = useId()
  const passwordId = useId()
  const creating = mode === 'create'

  async function submit(event: FormEvent) {
    event.preventDefault()
    await enter(() => (creating ? signup : login)(username, password))
  }

  async function enter(start: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await start()
      window.location.assign(safeNext(next))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong'
      )
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-[480px] flex-col gap-6 px-4 pt-6 pb-16 xs:px-6">
      <header className="flex items-start justify-between gap-4">
        <DialogBox className="sm:p-3.5">
          <h1 className="text-heading font-bold uppercase">
            {creating ? 'Create account' : 'Sign in'}
          </h1>
        </DialogBox>
        <HomeLink className="rounded-tag frame-tag bg-box px-4 hover:bg-inset" />
      </header>

      <form onSubmit={submit}>
        <DialogBox className="flex flex-col gap-4">
          <div>
            <label className="block text-body-lg" htmlFor={usernameId}>
              Username
            </label>
            <input
              autoComplete="username"
              className={field}
              id={usernameId}
              onChange={event => setUsername(event.target.value)}
              required
              value={username}
            />
          </div>
          <div>
            <label className="block text-body-lg" htmlFor={passwordId}>
              Password
            </label>
            <input
              autoComplete={creating ? 'new-password' : 'current-password'}
              className={field}
              id={passwordId}
              onChange={event => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error && (
            <p className="text-body-lg font-bold text-danger" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {creating ? 'Create account' : 'Sign in'}
          </Button>
          <button
            className="self-start text-label underline focus-visible:focus-ring"
            onClick={() => {
              setMode(creating ? 'signIn' : 'create')
              setError(null)
            }}
            type="button"
          >
            {creating ? 'I already have an account' : 'Create an account'}
          </button>
        </DialogBox>
      </form>

      {/* Outside the form, so its required fields don't stop it. */}
      <DialogBox className="flex flex-col gap-3">
        <p className="text-body-lg">
          Just looking? Play as a guest: no account needed. A guest lasts an
          hour.
        </p>
        <Button
          disabled={busy}
          onClick={() => void enter(playAsGuest)}
          variant="secondary"
        >
          Play as guest
        </Button>
      </DialogBox>
    </main>
  )
}

// Where to go after signing in: only somewhere on this site. Parsed the way the
// browser will parse it, rather than checking prefixes: browsers drop tabs and
// newlines inside URLs, so a prefix check passes "/\t/evil.com", which the
// browser then reads as //evil.com, another site.
export function safeNext(raw: null | string): string {
  if (!raw) return '/'
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin === window.location.origin) {
      return url.pathname + url.search + url.hash
    }
  } catch {
    // Not a URL at all.
  }
  return '/'
}
