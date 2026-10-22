import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

export type HandheldKey =
  | 'A'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'B'
  | 'Start'

// The battle is laid out at this width inside the shell, then zoomed to fit
// the glass. CSS zoom (unlike transform) scales layout, hit-testing and focus.
const SCREEN_WIDTH = 520
// A fixed shape, near the original 160×144 screen; the scene flexes inside it.
const SCREEN_HEIGHT = 540

type Control = (key: HandheldKey) => Record<string, unknown>

// Desktop and tablet: the battle sits in a portrait handheld, sized from the
// window height so it fits on screen. Phones: the shell disappears and the
// screen is the page. `classic` renders the screen in the original four greens.
export function Handheld({
  children,
  classic
}: {
  children: ReactNode
  classic: boolean
}) {
  const shell = useMediaQuery('(min-width: 48rem)')
  const glassRef = useRef<HTMLDivElement>(null)
  const zoom = useFitZoom(glassRef, shell)
  // Where the cursor last was, so the buttons can bring it back after a click
  // elsewhere on the page took focus off the screen.
  const lastFocusRef = useRef<HTMLElement | null>(null)

  // Keep focus in the battle when a button is clicked; the shell's buttons
  // duplicate the keyboard, so they stay out of the tab order and a11y tree.
  const control = (key: HandheldKey) => ({
    'data-control': key,
    onClick: () =>
      pressHandheldKey(glassRef.current, key, lastFocusRef.current),
    onPointerDown: (event: React.PointerEvent) => event.preventDefault(),
    tabIndex: -1,
    type: 'button' as const
  })

  return (
    // Outer: the size (and the container the cqw units measure). Inner: the body.
    <div className="handheld-device md:@container md:mx-auto md:w-[clamp(440px,calc((100svh-36px)/1.74),600px)]">
      <div className="handheld-body md:relative md:rounded-[2.5cqw_2.5cqw_16cqw_2.5cqw] md:border-2 md:border-[#9d9892] md:bg-[#c9c5c0] md:px-[5cqw] md:pt-[2cqw] md:pb-[7cqw] md:shadow-[inset_-1.2cqw_-1.2cqw_0_#b0aba5,inset_0.8cqw_0.8cqw_0_#dedbd7]">
        <FourGreens />

        <div
          aria-hidden
          className="mb-[4cqw] flex items-center justify-between border-b-2 border-[#b0aba5] pb-[1.5cqw] text-[2cqw] font-bold tracking-[0.1em] text-[#8f8a84] max-md:hidden"
          data-shell-extra
        >
          <span>◁ OFF · ON ▷</span>
          <span className="h-[1.2cqw] w-[12cqw] rounded-full bg-[#b0aba5]" />
        </div>

        <div className="md:relative md:rounded-[2cqw_2cqw_10cqw_2cqw] md:bg-[#5d5e72] md:px-[7.5cqw] md:pt-[3cqw] md:pb-[6cqw]">
          <Stripes />
          <Battery />
          <div
            className={cn(
              'handheld-screen overflow-hidden',
              classic && '[filter:url(#four-greens)]'
            )}
            data-classic={classic || undefined}
            onFocus={event => {
              lastFocusRef.current = event.target
            }}
            onKeyDown={moveInButtonRow}
            ref={glassRef}
          >
            <div
              style={
                shell
                  ? { height: SCREEN_HEIGHT, width: SCREEN_WIDTH, zoom }
                  : undefined
              }
            >
              {children}
            </div>
          </div>
        </div>

        <p
          aria-hidden
          className="mt-[3cqw] text-[3.4cqw] font-bold text-[#2c3e8f] italic max-md:hidden"
          data-shell-extra
        >
          Pocket{' '}
          <span className="text-[4.6cqw] tracking-[0.04em]">EXPLORER</span>
        </p>

        <div
          aria-hidden
          className="mt-[7cqw] flex items-center justify-between max-md:hidden"
          data-shell-extra
        >
          <DPad control={control} />
          <div className="mr-[2cqw] flex -rotate-[25deg] items-center gap-[4cqw] rounded-full bg-[#bab5b0] px-[2.5cqw] py-[2cqw] shadow-[inset_0.6cqw_0.6cqw_0_#a8a39d]">
            <RoundButton control={control('B')} hint="Esc" label="B" />
            <RoundButton control={control('A')} hint="Enter" label="A" />
          </div>
        </div>

        <div
          aria-hidden
          className="mt-[9cqw] flex justify-center gap-[7cqw] max-md:hidden"
          data-shell-extra
        >
          <Pill label="Select" />
          <Pill control={control('Start')} label="Start" />
        </div>

        <Speaker />
      </div>
    </div>
  )
}

// The on-screen buttons press the keys the keyboard would, on whatever the
// battle has focused, so the battle keeps one set of controls. A presses the
// focused control (or Enter, which advances a message when nothing is
// focused); B is Escape (back); the D-pad is the arrow keys; START presses
// the screen's `data-start` button. If focus has left the screen, the first
// arrow brings the cursor back to where it was instead of going nowhere.
export function pressHandheldKey(
  screen: HTMLElement | null,
  key: HandheldKey,
  lastFocus: HTMLElement | null = null
) {
  const active = document.activeElement
  const onScreen = (el: Element | null): el is HTMLElement =>
    !!screen && el instanceof HTMLElement && screen.contains(el)
  if (key === 'Start') {
    screen?.querySelector<HTMLButtonElement>('[data-start]:enabled')?.click()
    return
  }
  if (
    !onScreen(active) &&
    key !== 'B' &&
    onScreen(lastFocus) &&
    !(lastFocus as HTMLButtonElement).disabled
  ) {
    lastFocus.focus()
    if (key !== 'A') return
  }
  const focused = document.activeElement
  const target = onScreen(focused) ? focused : document.body
  if (key === 'A' && target !== document.body) {
    target.click()
    return
  }
  const code = key === 'A' ? 'Enter' : key === 'B' ? 'Escape' : key
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key: code })
  )
}

function Battery() {
  return (
    <div
      aria-hidden
      className="absolute top-[38%] left-[1.4cqw] flex flex-col items-center gap-[0.8cqw] max-md:hidden"
    >
      <span className="size-[2.2cqw] rounded-full bg-[#e8343b] shadow-[0_0_1.4cqw_#e8343b]" />
      <span className="text-[1.15cqw] font-bold text-[#d8d5d2]">BATTERY</span>
    </div>
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

function Lines({ className }: { className: string }) {
  return (
    <span className={cn('flex flex-col gap-[0.8cqw]', className)}>
      <span className="h-[0.6cqw] bg-[#8b1d4f]" />
      <span className="h-[0.6cqw] bg-[#2c3e8f]" />
    </span>
  )
}

// Plain button rows on the screen (the end of a battle, messages) have no
// menu of their own: arrows step through a `data-arrow-nav` row in order.
function moveInButtonRow(event: React.KeyboardEvent<HTMLElement>) {
  const step =
    event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : 0
  if (step === 0 || event.defaultPrevented) return
  if (!(event.target instanceof HTMLElement)) return
  const row = event.target.closest('[data-arrow-nav]')
  if (!row) return
  const items = Array.from(
    row.querySelectorAll<HTMLElement>('button:enabled, a[href]')
  )
  const index = items.indexOf(event.target)
  if (index < 0) return
  event.preventDefault()
  items[Math.max(0, Math.min(items.length - 1, index + step))]?.focus()
}

// The two thin lines across the top of the bezel, broken by a caption.
function Stripes() {
  return (
    <div
      aria-hidden
      className="mb-[3cqw] flex items-center gap-[1.5cqw] max-md:hidden"
    >
      <Lines className="w-[8cqw]" />
      <span className="text-[1.7cqw] font-bold tracking-[0.12em] whitespace-nowrap text-[#d8d5d2] italic">
        DOT MATRIX WITH STEREO SOUND
      </span>
      <Lines className="flex-1" />
    </div>
  )
}

// The CSS zoom that fits SCREEN_WIDTH into the glass, tracking resizes.
function useFitZoom(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const glass = ref.current
    if (!enabled || !glass || typeof ResizeObserver === 'undefined') return
    const fit = () => setZoom(glass.clientWidth / SCREEN_WIDTH)
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(glass)
    return () => observer.disconnect()
  }, [enabled, ref])
  return zoom
}

const arm =
  'flex items-center justify-center bg-[#2b2b2b] text-[3.4cqw] text-[#d8d5d2] active:bg-black active:text-white'

// A cross in a round recess, with a dimple in the middle.
function DPad({ control }: { control: Control }) {
  return (
    <div className="relative ml-[1cqw] rounded-full bg-[#bab5b0] p-[2.4cqw] shadow-[inset_0.6cqw_0.6cqw_0_#a8a39d]">
      <div className="grid size-[27cqw] grid-cols-3 grid-rows-3 drop-shadow-[0.6cqw_0.6cqw_0_#8f8a84]">
        <button
          {...control('ArrowUp')}
          className={cn(arm, 'col-start-2 rounded-t-[1cqw]')}
        >
          ▲
        </button>
        <button
          {...control('ArrowLeft')}
          className={cn(arm, 'col-start-1 row-start-2 rounded-l-[1cqw]')}
        >
          ◀
        </button>
        <span className="col-start-2 row-start-2 flex items-center justify-center bg-[#2b2b2b]">
          <span className="size-[4cqw] rounded-full bg-[#1d1d1d]" />
        </span>
        <button
          {...control('ArrowRight')}
          className={cn(arm, 'col-start-3 row-start-2 rounded-r-[1cqw]')}
        >
          ▶
        </button>
        <button
          {...control('ArrowDown')}
          className={cn(arm, 'col-start-2 row-start-3 rounded-b-[1cqw]')}
        >
          ▼
        </button>
      </div>
      <KeyHint className="absolute -bottom-[5cqw] left-1/2 -translate-x-1/2">
        Arrow keys
      </KeyHint>
    </div>
  )
}

// The keyboard key a control stands for, printed under it on the shell.
function KeyHint({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-[2cqw] font-bold tracking-[0.08em] whitespace-nowrap text-[#2c3e8f] uppercase',
        className
      )}
    >
      {children}
    </span>
  )
}

// SELECT is decorative; START presses the screen's START button, if any.
function Pill({
  control,
  label
}: {
  control?: Record<string, unknown>
  label: string
}) {
  const pill =
    'block h-[2.4cqw] w-[11cqw] rounded-full bg-[#8f8a84] shadow-[inset_-0.4cqw_-0.4cqw_0_#6b6762]'
  return (
    <span className="flex -rotate-[25deg] flex-col items-center gap-[1.2cqw]">
      {control ? (
        <button
          {...control}
          className={cn(pill, 'active:translate-y-[0.3cqw]')}
        />
      ) : (
        <span className={pill} />
      )}
      <span className="text-[2cqw] font-bold tracking-[0.12em] text-[#2c3e8f] uppercase italic">
        {label}
      </span>
    </span>
  )
}

function RoundButton({
  control,
  hint,
  label
}: {
  control: Record<string, unknown>
  hint: string
  label: string
}) {
  return (
    <div className="relative">
      <button
        {...control}
        className="block size-[13cqw] rounded-full bg-[#9b2a5a] shadow-[0.6cqw_0.8cqw_0_#5e1736,inset_-0.8cqw_-0.8cqw_0_#7a2048] active:translate-y-[0.4cqw] active:shadow-[0.2cqw_0.3cqw_0_#5e1736]"
      />
      <span className="absolute top-full left-1/2 mt-[1.5cqw] flex -translate-x-1/2 flex-col items-center">
        <span className="text-[2.8cqw] font-bold text-[#2c3e8f] italic">
          {label}
        </span>
        <KeyHint>{hint}</KeyHint>
      </span>
    </div>
  )
}

function Speaker() {
  return (
    <div
      aria-hidden
      className="absolute right-[7cqw] bottom-[6cqw] flex -rotate-[25deg] gap-[1.6cqw] max-md:hidden"
      data-shell-extra
    >
      {Array.from({ length: 6 }, (_, slot) => (
        <span
          className="h-[12cqw] w-[1.6cqw] rounded-full bg-[#a8a39d] shadow-[inset_0.4cqw_0.4cqw_0_#8f8a84]"
          // Identical slots: the position is the key.
          key={slot}
        />
      ))}
    </div>
  )
}
