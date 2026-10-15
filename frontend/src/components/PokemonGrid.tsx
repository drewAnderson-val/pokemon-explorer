import { Input } from './ui/input'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Pokemon = {
  attack: number
  defense: number
  description: string
  generation: number
  height: number
  hp: number
  id: number
  imageUrl: string
  isLegendary?: boolean
  name: string
  specialAttack: number
  specialDefense: number
  speed: number
  types: string[]
  weight: number
}

const colors: Record<string, string> = {
  Bug: 'bg-lime-500 hover:bg-lime-600',
  Dark: 'bg-slate-800 hover:bg-slate-900',
  Dragon: 'bg-indigo-700 hover:bg-indigo-800',
  Electric: 'bg-yellow-500 hover:bg-yellow-600',
  Fairy: 'bg-pink-300 hover:bg-pink-400',
  Fighting: 'bg-red-700 hover:bg-red-800',
  Fire: 'bg-red-500 hover:bg-red-600',
  Flying: 'bg-indigo-400 hover:bg-indigo-500',
  Ghost: 'bg-purple-700 hover:bg-purple-800',
  Grass: 'bg-green-500 hover:bg-green-600',
  Ground: 'bg-amber-600 hover:bg-amber-700',
  Ice: 'bg-cyan-300 hover:bg-cyan-400',
  Normal: 'bg-slate-400 hover:bg-slate-500',
  Poison: 'bg-purple-500 hover:bg-purple-600',
  Psychic: 'bg-pink-500 hover:bg-pink-600',
  Rock: 'bg-amber-700 hover:bg-amber-800',
  Steel: 'bg-slate-500 hover:bg-slate-600',
  Water: 'bg-blue-500 hover:bg-blue-600'
}

// just a little helper guy
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTypeColor = (type: string) => {
  return colors[type] || 'bg-slate-400 hover:bg-slate-500'
}

export default function PokemonGrid() {
  return (
    <div>
      <Input placeholder="Search" type="text" />
      <div>Pokemon Grid</div>
    </div>
  )
}
