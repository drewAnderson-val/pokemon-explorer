import { useState } from 'react'

import { cardImageUrl, formatNumber } from '@/lib/format'
import { typeStyle } from '@/lib/type-colors'

type ArtPanelProps = {
  legendary: boolean
  name: string
  number: number
  src: string
  type: string
}

export function ArtPanel({
  legendary,
  name,
  number,
  src,
  type
}: ArtPanelProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== '' && !failed

  return (
    <div
      className="relative h-[140px] overflow-hidden rounded-inset frame-inset bg-inset"
      style={typeStyle(type)}
    >
      {showImage ? (
        // Fixture images are random placeholders, not the creature: decorative.
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={360}
          loading="lazy"
          onError={() => setFailed(true)}
          src={cardImageUrl(src)}
          width={480}
        />
      ) : (
        <div aria-hidden className="flex size-full items-center justify-center">
          <div className="flex h-24 w-36 items-center justify-center rounded-[50%] bg-(--type)/33">
            <span className="text-[80px] leading-none font-bold text-(--type) [text-shadow:3px_3px_0_var(--color-ink)]">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 rounded-tag bg-box/90 px-1.5 text-caption">
        {formatNumber(number)}
      </span>
      {legendary && (
        <span className="absolute top-1.5 right-1.5 rounded-tag frame-tag bg-accent px-1.5 text-label font-bold uppercase">
          Legend
        </span>
      )}
    </div>
  )
}
