import { cn } from '@/lib/utils'

// The opponent's team before the battle: never shown, only a bobbing "?".
// (Reduced motion turns every animation off, so it sits still.)
export function FloatingQuestion({
  className,
  label
}: {
  className?: string
  label: string
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-block animate-bob font-bold select-none',
        className
      )}
      role="img"
    >
      ?
    </span>
  )
}
