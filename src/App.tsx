import { BattleScreen, parsePlayerId } from '@/screens/BattleScreen'
import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'

// A few screens and plain links between them: a router would be overkill.
export default function App() {
  const { pathname, search } = window.location
  if (pathname.startsWith('/explore')) return <ExplorerScreen />
  if (pathname.startsWith('/battle')) {
    return <BattleScreen playerId={parsePlayerId(search)} />
  }
  return <LandingScreen />
}
