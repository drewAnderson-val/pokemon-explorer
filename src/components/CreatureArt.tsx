import { useState } from 'react'

import { cardImageUrl } from '@/lib/format'
import { typeStyle } from '@/lib/type-colors'
import { cn } from '@/lib/utils'

type CreatureArtProps = {
  // Requested image size in device pixels; defaults to the card art panel.
  height?: number
  // Size of the fallback letter, which has no image to scale with.
  letterClassName?: string
  name: string
  src: string
  type: string
  width?: number
}

// The creature's image, or its first letter on a type-colored oval when there
// is no image or it fails to load. Fills its parent.
export function CreatureArt({
  height = 320,
  letterClassName = 'text-[80px]',
  name,
  src,
  type,
  width = 640
}: CreatureArtProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== '' && !failed

  return showImage ? (
    // Fixture images are random placeholders, not the creature: decorative.
    <img
      alt=""
      className="size-full object-cover"
      decoding="async"
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
      src={cardImageUrl(src, width, height)}
      width={width}
    />
  ) : (
    <div
      aria-hidden
      className="flex size-full items-center justify-center"
      style={typeStyle(type)}
    >
      <div className="flex h-[70%] w-[90%] max-w-36 items-center justify-center rounded-[50%] bg-(--type)/33">
        <span
          className={cn(
            'leading-none font-bold text-(--type) [text-shadow:3px_3px_0_var(--color-ink)]',
            letterClassName
          )}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  )
}
