import type { SortKey } from '@/lib/pokemon'

import { cn } from '@/lib/utils'

const OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'No.', value: 'id' },
  { label: 'Strongest', value: 'total' },
  { label: 'Fastest', value: 'speed' }
]

type SortMenuProps = { onChange: (value: SortKey) => void; value: SortKey }

export function SortMenu({ onChange, value }: SortMenuProps) {
  return (
    // A plain row under the chips: a second boxed panel made the toolbar look heavy.
    <fieldset className="flex flex-wrap items-center gap-x-4 whitespace-nowrap">
      <legend className="sr-only">Sort by</legend>
      <span
        aria-hidden
        className="hidden text-label font-bold text-ink-muted uppercase xs:inline"
      >
        Sort
      </span>
      {OPTIONS.map(option => {
        const selected = option.value === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'group inline-flex h-11 items-center gap-1 text-label uppercase focus-visible:focus-ring xs:h-10',
              selected ? 'font-bold' : 'font-medium'
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <span
              aria-hidden
              className={selected ? 'visible' : 'invisible group-hover:visible'}
            >
              ▶
            </span>
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}
