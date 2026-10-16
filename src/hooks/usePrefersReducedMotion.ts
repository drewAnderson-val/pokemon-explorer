import { useMediaQuery } from './useMediaQuery'

// CSS already turns off animations under reduced motion (globals.css); this
// covers the motion that JavaScript drives (typing text, draining HP).
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
