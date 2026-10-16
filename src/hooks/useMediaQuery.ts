import { useCallback, useSyncExternalStore } from 'react'

// Whether a CSS media query matches, kept in sync as it changes. False where
// matchMedia doesn't exist (jsdom without a stub, server rendering).
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false,
    () => false
  )
}
