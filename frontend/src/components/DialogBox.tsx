import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type DialogBoxProps = ComponentProps<'div'> & {
  showMore?: boolean
  tone?: 'dark' | 'default'
}

// The base "text box" most of the UI is built from.
export function DialogBox({
  children,
  className,
  showMore = false,
  tone = 'default',
  ...props
}: DialogBoxProps) {
  const dark = tone === 'dark'
  return (
    <div
      className={cn(
        'relative',
        dark
          ? 'rounded-inset bg-ink p-3.5 text-white'
          : 'frame-box rounded-box bg-box p-3.5 sm:p-5',
        showMore && 'pb-7',
        className
      )}
      {...props}
    >
      {children}
      {showMore && (
        <span
          aria-hidden
          // Accent ▼ is ~1.5:1 on white, so light boxes use ink (see decisions.md).
          className={cn(
            'absolute right-3 bottom-1 animate-blink text-body',
            dark ? 'text-accent' : 'text-ink'
          )}
        >
          ▼
        </span>
      )}
    </div>
  )
}
