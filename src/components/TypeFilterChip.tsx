import type { PokemonType } from '@/lib/pokemon'

import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

type TypeFilterChipProps = {
  onPress: () => void
  pressed: boolean
  type: null | PokemonType
}

export function TypeFilterChip({
  onPress,
  pressed,
  type
}: TypeFilterChipProps) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-tag frame-tag px-3 text-label font-bold uppercase focus-visible:focus-ring xs:h-10 xs:w-full',
        pressed ? 'bg-ink text-white' : 'bg-box hover:bg-inset'
      )}
      onClick={onPress}
      style={type ? typeStyle(type) : undefined}
      type="button"
    >
      {type && (
        <span
          aria-hidden
          className="size-2.5 border-2 border-ink bg-(--type)"
        />
      )}
      {type ?? 'All'}
    </button>
  )
}
