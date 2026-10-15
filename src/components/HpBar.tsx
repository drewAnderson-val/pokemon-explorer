import { cn } from '@/lib/utils'

type HpBarProps = {
  // Current HP. Cards pass only this (always full); battles pass `max` too.
  hp: number
  max?: number
}

export function hpTone(ratio: number) {
  if (ratio < 0.2) return 'low'
  if (ratio < 0.5) return 'warn'
  return 'good'
}

const TONE_CLASS = {
  good: 'bg-hp-good',
  low: 'bg-hp-low',
  warn: 'bg-hp-warn'
} as const

export function HpBar({ hp, max = hp }: HpBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, hp / max)) : 0
  const tone = hpTone(ratio)
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-tag bg-ink px-1.5 text-label font-bold text-accent">
        HP
      </span>
      <span
        aria-hidden
        className="h-2.5 flex-1 overflow-hidden rounded-inset frame-inset bg-track"
      >
        <span
          className={cn('block h-full', TONE_CLASS[tone])}
          data-tone={tone}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="text-caption tabular-nums">
        {hp}/{max}
      </span>
    </div>
  )
}
