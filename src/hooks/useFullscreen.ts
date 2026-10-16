import { type RefObject, useEffect, useState } from 'react'

// Full screen for one element. Escape leaves full screen as everywhere else
// (keeping Escape for the game via Keyboard Lock meant *holding* it to leave,
// which read as "exit doesn't work"). `supported` is false where elements
// can't go full screen (e.g. iPhone Safari), so callers hide the button.
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
      if (document.fullscreenElement) await document.exitFullscreen()
      else await ref.current?.requestFullscreen()
    } catch (error) {
      console.warn('Full screen was not available', error)
    }
  }

  return { active, supported: document.fullscreenEnabled === true, toggle }
}
