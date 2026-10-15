import type { KeyboardEvent, ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils'

export type MenuItem = {
  detail?: ReactNode
  disabled?: boolean
  key: string
  label: string
  onSelect: () => void
}

type BattleMenuProps = {
  cols: number
  disabled?: boolean
  items: MenuItem[]
  label: string
  // Shown as a BACK item and bound to Escape.
  onBack?: () => void
  ref?: Ref<HTMLDivElement>
}

const ARROWS: Record<string, 'x' | 'y'> = {
  ArrowDown: 'y',
  ArrowLeft: 'x',
  ArrowRight: 'x',
  ArrowUp: 'y'
}

type MenuButtonProps = {
  className?: string
  detail?: ReactNode
  disabled: boolean
  label: string
  onClick: () => void
}

export function BattleMenu({
  cols,
  disabled = false,
  items,
  label,
  onBack,
  ref
}: BattleMenuProps) {
  return (
    <div
      aria-label={label}
      className="grid gap-x-3 gap-y-1"
      onKeyDown={event => {
        if (event.key === 'Escape' && onBack) {
          event.preventDefault()
          onBack()
          return
        }
        moveFocus(event, cols)
      }}
      ref={ref}
      role="group"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map(item => (
        <MenuButton
          detail={item.detail}
          disabled={disabled || item.disabled === true}
          key={item.key}
          label={item.label}
          onClick={item.onSelect}
        />
      ))}
      {onBack && (
        <MenuButton
          className="col-span-full"
          disabled={disabled}
          label="Back"
          onClick={onBack}
        />
      )}
    </div>
  )
}

function MenuButton({
  className,
  detail,
  disabled,
  label,
  onClick
}: MenuButtonProps) {
  return (
    <button
      className={cn(
        'group flex min-h-11 min-w-0 items-start gap-1 rounded-tag px-1 py-1.5 text-left focus-visible:focus-ring enabled:hover:bg-inset disabled:text-ink-muted',
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          'invisible text-label font-bold',
          !disabled && 'group-hover:visible group-focus-visible:visible'
        )}
      >
        ▶
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-label font-bold uppercase">{label}</span>
        {detail}
      </span>
    </button>
  )
}

// Arrow keys move focus around the grid (left/right stay within a row),
// Enter/Space press the focused button natively, Escape goes back.
function moveFocus(event: KeyboardEvent<HTMLDivElement>, cols: number) {
  const axis = ARROWS[event.key]
  if (!axis) return
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled')
  )
  const index = buttons.findIndex(button => button === document.activeElement)
  if (index < 0) return
  event.preventDefault()
  const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
  const step = (axis === 'x' ? 1 : cols) * (forward ? 1 : -1)
  let next = index + step
  if (axis === 'x' && Math.floor(next / cols) !== Math.floor(index / cols)) {
    return
  }
  // Down from the last full row lands on the trailing item (BACK).
  if (axis === 'y' && forward && next >= buttons.length) {
    next = buttons.length - 1
  }
  buttons[next]?.focus()
}
