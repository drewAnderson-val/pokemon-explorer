import { formatHeight, formatWeight } from '@/lib/format'

type MetaRowProps = { generation: number; height: number; weight: number }

export function MetaRow({ generation, height, weight }: MetaRowProps) {
  const cells = [
    ['Generation', `GEN ${generation}`],
    ['Height', formatHeight(height)],
    ['Weight', formatWeight(weight)]
  ]
  return (
    <dl className="grid grid-cols-3 gap-2 text-center text-caption">
      {cells.map(([label, value]) => (
        <div className="rounded-tag frame-inset px-1 py-1.5" key={label}>
          <dt className="sr-only">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
