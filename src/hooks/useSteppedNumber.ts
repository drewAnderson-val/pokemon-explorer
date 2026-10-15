import { useEffect, useState } from 'react'

const TICK_MS = 40
const TICKS_FOR_FULL_BAR = 48

// Moves a displayed number toward `target` in small jumps, like an HP bar
// draining a few points per frame. `max` sets the jump size (1/48 of it), so a
// full bar drains in about two seconds. `instant` jumps straight there.
export function useSteppedNumber(
  target: number,
  max: number,
  instant: boolean
) {
  const [value, setValue] = useState(target)
  const step = Math.max(1, Math.ceil(max / TICKS_FOR_FULL_BAR))

  useEffect(() => {
    if (instant || value === target) return
    const timer = setTimeout(() => {
      setValue(current =>
        current > target
          ? Math.max(target, current - step)
          : Math.min(target, current + step)
      )
    }, TICK_MS)
    return () => clearTimeout(timer)
  }, [instant, step, target, value])

  return instant ? target : value
}
