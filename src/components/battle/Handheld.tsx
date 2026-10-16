import { type ReactNode, useRef } from 'react'

import { cn } from '@/lib/utils'

export type HandheldKey =
  | 'A'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'B'

type Control = (key: HandheldKey) => Record<string, unknown>

// Desktop and tablet: the battle sits in a handheld with a D-pad and A/B.
// Phones: the shell disappears and the screen is the page. `classic` turns
// the screen into the original four greens (works with or without the shell).
export function Handheld({
  children,
  classic
}: {
  children: ReactNode
  classic: boolean
}) {
  const screenRef = useRef<HTMLDivElement>(null)

  // Keep focus in the battle when a button is clicked; the shell's buttons
  // duplicate the keyboard, so they stay out of the tab order and a11y tree.
  const control = (key: HandheldKey) => ({
    'data-control': key,
    onClick: () => pressHandheldKey(screenRef.current, key),
    onPointerDown: (event: React.PointerEvent) => event.preventDefault(),
    tabIndex: -1,
    type: 'button' as const
  })

  return (
    <div className="md:flex md:items-center md:gap-8 md:rounded-[36px] md:border-4 md:border-ink md:bg-[#c9c5c0] md:p-6 md:shadow-[inset_-8px_-8px_0_#aaa49e]">
      <FourGreens />

      <div
        aria-hidden
        className="flex-none flex-col items-center gap-10 max-md:hidden md:flex"
      >
        <DPad control={control} />
        <div className="flex gap-3">
          <Pill label="Select" />
          <Pill label="Start" />
        </div>
      </div>

      <div className="min-w-0 flex-1 md:rounded-[16px_16px_48px_16px] md:border-4 md:border-ink md:bg-[#5b5b6e] md:px-5 md:pt-5 md:pb-2">
        <div
          className={cn(classic && '[filter:url(#four-greens)]')}
          data-classic={classic || undefined}
          ref={screenRef}
        >
          {children}
        </div>
        <p
          aria-hidden
          className="mt-1.5 text-center text-caption font-bold tracking-[0.25em] text-[#d8d4cf] uppercase italic max-md:hidden"
        >
          Pocket Explorer
        </p>
      </div>

      <div
        aria-hidden
        className="flex-none items-end gap-4 max-md:hidden md:flex"
      >
        <RoundButton control={control('B')} label="B" />
        <RoundButton
          className="-translate-y-8"
          control={control('A')}
          label="A"
        />
      </div>
    </div>
  )
}

// The on-screen buttons press the keys the keyboard would, on whatever the
// battle has focused, so the battle keeps one set of controls. A presses the
// focused control (or Enter, which advances a message when nothing is
// focused); B is Escape (back); the D-pad is the arrow keys.
export function pressHandheldKey(screen: HTMLElement | null, key: HandheldKey) {
  const active = document.activeElement
  const target =
    screen && active instanceof HTMLElement && screen.contains(active)
      ? active
      : document.body
  if (key === 'A' && target !== document.body) {
    target.click()
    return
  }
  const code = key === 'A' ? 'Enter' : key === 'B' ? 'Escape' : key
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key: code })
  )
}

// Luminance posterised to the original handheld's four greens
// (#0F380F, #306230, #8BAC0F, #9BBC0F), applied to the whole screen.
function FourGreens() {
  return (
    <svg aria-hidden className="absolute size-0">
      <filter colorInterpolationFilters="sRGB" id="four-greens">
        <feColorMatrix
          type="matrix"
          values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"
        />
        <feComponentTransfer>
          <feFuncR tableValues="0.059 0.188 0.545 0.608" type="discrete" />
          <feFuncG tableValues="0.220 0.384 0.675 0.737" type="discrete" />
          <feFuncB tableValues="0.059 0.188 0.059 0.059" type="discrete" />
        </feComponentTransfer>
      </filter>
    </svg>
  )
}

const padButton =
  'flex items-center justify-center bg-ink text-[14px] text-[#8a8580] active:bg-black active:text-white'

function DPad({ control }: { control: Control }) {
  return (
    <div className="grid size-[132px] grid-cols-3 grid-rows-3">
      <button
        {...control('ArrowUp')}
        className={cn(padButton, 'col-start-2 rounded-t-[6px]')}
      >
        ▲
      </button>
      <button
        {...control('ArrowLeft')}
        className={cn(padButton, 'col-start-1 row-start-2 rounded-l-[6px]')}
      >
        ◀
      </button>
      <span className="col-start-2 row-start-2 bg-ink" />
      <button
        {...control('ArrowRight')}
        className={cn(padButton, 'col-start-3 row-start-2 rounded-r-[6px]')}
      >
        ▶
      </button>
      <button
        {...control('ArrowDown')}
        className={cn(padButton, 'col-start-2 row-start-3 rounded-b-[6px]')}
      >
        ▼
      </button>
    </div>
  )
}

// Decorative, like the real ones would be here: START/SELECT do nothing.
function Pill({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="h-3 w-12 -rotate-[25deg] rounded-full bg-[#8a8580]" />
      <span className="text-[11px] font-bold tracking-[0.1em] text-[#5b5b6e] uppercase">
        {label}
      </span>
    </span>
  )
}

function RoundButton({
  className,
  control,
  label
}: {
  className?: string
  control: Record<string, unknown>
  label: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <button
        {...control}
        className="size-16 rounded-full border-4 border-ink bg-[#9b2a5a] shadow-[inset_-4px_-4px_0_#6e1d40] active:translate-y-0.5 active:shadow-none"
      />
      <span className="text-label font-bold text-[#5b5b6e]">{label}</span>
    </div>
  )
}
