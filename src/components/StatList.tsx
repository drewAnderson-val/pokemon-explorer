import { type Pokemon, totalStats } from '@/lib/pokemon'

const ROWS = [
  ['Attack', 'attack'],
  ['Defense', 'defense'],
  ['Sp. Atk', 'specialAttack'],
  ['Sp. Def', 'specialDefense'],
  ['Speed', 'speed']
] as const

// Dotted leaders are drawn with ::after so <dl> only contains dt/dd.
const leader =
  "flex flex-1 items-baseline gap-2 uppercase after:flex-1 after:border-b-2 after:border-dotted after:border-rule after:content-['']"

export function StatList({ pokemon }: { pokemon: Pokemon }) {
  return (
    <dl className="text-body">
      {ROWS.map(([label, key]) => (
        <div className="flex items-baseline gap-2" key={key}>
          <dt className={leader}>{label}</dt>
          <dd className="font-bold">{pokemon[key]}</dd>
        </div>
      ))}
      <div className="mt-1.5 flex items-baseline justify-between border-t-2 border-ink pt-1.5">
        <dt className="font-bold uppercase">Total</dt>
        <dd className="font-bold">{totalStats(pokemon)}</dd>
      </div>
    </dl>
  )
}
