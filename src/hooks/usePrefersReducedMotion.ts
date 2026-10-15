import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// CSS already turns off animations under reduced motion (globals.css); this
// covers the motion that JavaScript drives (typing text, draining HP).
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

function getSnapshot() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
