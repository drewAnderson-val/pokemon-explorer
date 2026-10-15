import { cn } from '@/lib/utils'

// The face-down side of a custom card. Sized like a CreationCard (same
// container query and square art slot) so a flip lines up edge to edge.
export function CardBack({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        '@container relative overflow-hidden rounded-box frame-box bg-ink p-3.5',
        className
      )}
    >
      <div className="grid @xl:grid-cols-2">
        <span className="block aspect-square" />
      </div>
      <span className="absolute inset-3 rounded-inset border-4 border-accent bg-[repeating-linear-gradient(45deg,var(--color-accent)_0_10px,transparent_10px_22px)] opacity-60" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-24 items-center justify-center rounded-full border-[6px] border-ink bg-accent text-[56px] leading-none font-bold text-ink shadow-press">
          ?
        </span>
      </span>
    </div>
  )
}
