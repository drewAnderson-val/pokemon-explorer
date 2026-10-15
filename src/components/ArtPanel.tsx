import { formatNumber } from '@/lib/format'
import { typeStyle } from '@/lib/type-colors'

import { CreatureArt } from './CreatureArt'

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
  return (
    <div
      className="relative h-[140px] overflow-hidden rounded-inset frame-inset bg-inset"
      style={typeStyle(type)}
    >
      <CreatureArt name={name} src={src} type={type} />
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
