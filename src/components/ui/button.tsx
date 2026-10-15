import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'frame-tag bg-box text-ink hover:bg-inset'
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants
}

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClass(variant, className)}
      type="button"
      {...props}
    />
  )
}

// For links that should look like buttons (navigation stays an <a>).
export function buttonClass(
  variant: keyof typeof variants = 'primary',
  className?: string
) {
  return cn(
    'inline-flex h-11 items-center justify-center rounded-tag px-4 text-label font-bold uppercase focus-visible:focus-ring',
    variants[variant],
    className
  )
}
