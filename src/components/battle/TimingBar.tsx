import { useEffect, useRef, useState } from 'react'

import {
  barPosition,
  TIMING_LABEL,
  TIMING_PASS_MS,
  TIMING_WINDOW_MS,
  type TimingGrade,
  timingResult
} from '@/lib/battle/timing'
import { cn } from '@/lib/utils'

type TimingBarProps = {
  onCancel: () => void
  onDone: (bonus: number) => void
}

// How long the result shows before the turn plays out.
const RESULT_MS = 450

// A pointer sweeps along the bar (CSS animation); pressing stops it. The
// position at the press comes from elapsed time, so it matches what's drawn.
// The whole bar is one button: Space, Enter, a click or a tap all work.
export function TimingBar({ onCancel, onDone }: TimingBarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const started = useRef(0)
  // A new onDone each parent render mustn't restart the result timer.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })
  const [result, setResult] = useState<null | {
    bonus: number
    grade: TimingGrade
    position: number
  }>(null)

  useEffect(() => {
    started.current = performance.now()
    buttonRef.current?.focus()
    // No press in time: the turn goes ahead at ×1.
    const timeout = setTimeout(
      () => setResult(r => r ?? { bonus: 1, grade: 'ok', position: 0 }),
      TIMING_WINDOW_MS
    )
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => onDoneRef.current(result.bonus), RESULT_MS)
    return () => clearTimeout(timer)
  }, [result])

  const stop = () => {
    if (result) return
    const position = barPosition(
      performance.now() - started.current,
      TIMING_PASS_MS
    )
    setResult({ ...timingResult(position), position })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label font-bold uppercase" id="timing-help">
        {result ? TIMING_LABEL[result.grade] : 'Stop it in the middle!'}
      </p>
      <button
        aria-describedby="timing-help"
        aria-label="Stop the timing bar"
        className="relative h-11 w-full overflow-hidden rounded-inset frame-inset bg-track focus-visible:focus-ring"
        onClick={stop}
        onKeyDown={event => {
          if (event.key !== 'Escape' || result) return
          event.preventDefault()
          onCancel()
        }}
        ref={buttonRef}
        type="button"
      >
        {/* Zones: Nice is the middle half, Perfect the middle tenth. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/4 w-1/2 bg-hp-warn/60"
        />
        <span
          aria-hidden
          className="absolute inset-y-0 left-[45%] w-[10%] bg-hp-good"
        />
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 w-2 bg-ink',
            !result && 'animate-timing-sweep'
          )}
          style={
            result
              ? { left: `calc(${result.position * 100}% - 4px)` }
              : undefined
          }
        />
      </button>
      <p className="text-caption text-ink-muted">
        Space, Enter or tap · Esc to go back
      </p>
    </div>
  )
}
