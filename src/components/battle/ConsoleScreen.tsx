import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Fills the handheld's glass like the battle does, so a message doesn't float
// at the top of an empty screen (and the screen doesn't jump when the battle
// starts).
export function ConsoleScreen({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col justify-center rounded-box frame-box bg-box p-2 sm:p-3',
        className
      )}
      data-battle-message
    >
      {children}
    </section>
  )
}
