import { cn } from '@/lib/utils'

// Back to the landing page's start menu, on every screen but the landing page.
export function HomeLink({ className }: { className?: string }) {
  return (
    <a
      className={cn(
        'inline-flex h-11 items-center gap-1 text-label font-bold uppercase focus-visible:focus-ring',
        className
      )}
      href="/"
    >
      <span aria-hidden>◀</span>
      Home
    </a>
  )
}
