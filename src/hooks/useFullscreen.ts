import { type RefObject, useEffect, useState } from 'react'

// Keyboard Lock (Chromium): lets the page keep Escape while full screen.
type LockableNavigator = Navigator & {
  keyboard?: { lock?: (keys: string[]) => Promise<void> }
}

// Full screen for one element. Escape is the battle's "back", so where the
// browser allows it we keep Escape (hold it to leave full screen instead);
// elsewhere Escape leaves full screen as usual. `supported` is false where
// elements can't go full screen (e.g. iPhone Safari), so callers hide the button.
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const sync = () =>
      setActive(
        document.fullscreenElement !== null &&
          document.fullscreenElement === ref.current
      )
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  // The browser can refuse (no user gesture, a permissions policy): then the
  // page just stays as it is.
  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await ref.current?.requestFullscreen()
      await (navigator as LockableNavigator).keyboard?.lock?.(['Escape'])
    } catch (error) {
      console.warn('Full screen was not available', error)
    }
  }

  return { active, supported: document.fullscreenEnabled === true, toggle }
}
