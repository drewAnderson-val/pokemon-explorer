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

  // Keep focus in the battle when a button is clicked; the shell's buttons
  // duplicate the keyboard, so they stay out of the tab order and a11y tree.
  const control = (key: HandheldKey) => ({
    'data-control': key,
    onClick: () => pressHandheldKey(glassRef.current, key),
    onPointerDown: (event: React.PointerEvent) => event.preventDefault(),
    tabIndex: -1,
    type: 'button' as const
  })

  return (
    // Outer: the size (and the container the cqw units measure). Inner: the body.
    <div className="handheld-device md:@container md:mx-auto md:w-[clamp(440px,calc((100svh-36px)/1.74),600px)]">
      <div className="md:relative md:rounded-[2.5cqw_2.5cqw_16cqw_2.5cqw] md:border-2 md:border-[#9d9892] md:bg-[#c9c5c0] md:px-[5cqw] md:pt-[2cqw] md:pb-[7cqw] md:shadow-[inset_-1.2cqw_-1.2cqw_0_#b0aba5,inset_0.8cqw_0.8cqw_0_#dedbd7]">
        <FourGreens />

        <div
          aria-hidden
          className="mb-[4cqw] flex items-center justify-between border-b-2 border-[#b0aba5] pb-[1.5cqw] text-[2cqw] font-bold tracking-[0.1em] text-[#8f8a84] max-md:hidden"
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
        >
          Pocket{' '}
          <span className="text-[4.6cqw] tracking-[0.04em]">EXPLORER</span>
        </p>

        <div
          aria-hidden
          className="mt-[7cqw] flex items-center justify-between max-md:hidden"
        >
          <DPad control={control} />
          <div className="mr-[2cqw] flex -rotate-[25deg] items-center gap-[4cqw] rounded-full bg-[#bab5b0] px-[2.5cqw] py-[2cqw] shadow-[inset_0.6cqw_0.6cqw_0_#a8a39d]">
            <RoundButton control={control('B')} label="B" />
            <RoundButton control={control('A')} label="A" />
          </div>
        </div>

        <div
          aria-hidden
          className="mt-[9cqw] flex justify-center gap-[7cqw] max-md:hidden"
        >
          <Pill label="Select" />
          <Pill label="Start" />
        </div>

        <Speaker />
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
  'flex items-center justify-center bg-[#2b2b2b] text-[2.4cqw] text-[#6b6762] active:bg-black active:text-[#b0aba5]'

// A cross in a round recess, with a dimple in the middle.
function DPad({ control }: { control: Control }) {
  return (
    <div className="ml-[1cqw] rounded-full bg-[#bab5b0] p-[2.4cqw] shadow-[inset_0.6cqw_0.6cqw_0_#a8a39d]">
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
    </div>
  )
}

// Decorative, like on the real thing here: START/SELECT do nothing.
function Pill({ label }: { label: string }) {
  return (
    <span className="flex -rotate-[25deg] flex-col items-center gap-[1.2cqw]">
      <span className="h-[2.4cqw] w-[11cqw] rounded-full bg-[#8f8a84] shadow-[inset_-0.4cqw_-0.4cqw_0_#6b6762]" />
      <span className="text-[2cqw] font-bold tracking-[0.12em] text-[#2c3e8f] uppercase italic">
        {label}
      </span>
    </span>
  )
}

function RoundButton({
  control,
  label
}: {
  control: Record<string, unknown>
  label: string
}) {
  return (
    <div className="relative">
      <button
        {...control}
        className="block size-[13cqw] rounded-full bg-[#9b2a5a] shadow-[0.6cqw_0.8cqw_0_#5e1736,inset_-0.8cqw_-0.8cqw_0_#7a2048] active:translate-y-[0.4cqw] active:shadow-[0.2cqw_0.3cqw_0_#5e1736]"
      />
      <span className="absolute -bottom-[6cqw] left-1/2 -translate-x-1/2 text-[2.8cqw] font-bold text-[#2c3e8f] italic">
        {label}
      </span>
    </div>
  )
}

function Speaker() {
  return (
    <div
      aria-hidden
      className="absolute right-[7cqw] bottom-[6cqw] flex -rotate-[25deg] gap-[1.6cqw] max-md:hidden"
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
