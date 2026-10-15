import { typeStyle } from '@/lib/type-colors'

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-tag frame-tag bg-(--type) px-2 text-[14px] font-bold text-(--type-text) uppercase"
      style={typeStyle(type)}
    >
      {type}
    </span>
  )
}
