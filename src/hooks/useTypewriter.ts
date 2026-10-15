import { useEffect, useState } from 'react'

const CHAR_MS = 22

// Reveals `text` a character at a time. A new `id` restarts it, so the same
// sentence twice in a row still types out again. `instant` skips the effect.
export function useTypewriter(text: string, id: string, instant: boolean) {
  const [typed, setTyped] = useState({ count: 0, id })

  // Reset during render when the message changes (no flash of the full text).
  let count = typed.count
  if (typed.id !== id) {
    count = 0
    setTyped({ count, id })
  }

  const shown = instant ? text.length : Math.min(count, text.length)
  const done = shown >= text.length

  useEffect(() => {
    if (done) return
    const timer = setTimeout(
      () => setTyped(t => (t.id === id ? { count: t.count + 1, id } : t)),
      CHAR_MS
    )
    return () => clearTimeout(timer)
  }, [done, id, shown])

  return {
    done,
    finish: () => setTyped({ count: text.length, id }),
    shown: text.slice(0, shown)
  }
}
