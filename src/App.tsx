import { BattleScreen, parsePlayerId } from '@/screens/BattleScreen'
import { CreatorScreen } from '@/screens/CreatorScreen'
import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'
import { parseMatchId, VersusScreen } from '@/screens/VersusScreen'

// A few screens and plain links between them: a router would be overkill.
export default function App() {
  const { pathname, search } = window.location
  if (pathname.startsWith('/explore')) return <ExplorerScreen />
  if (pathname.startsWith('/create')) return <CreatorScreen />
  if (/^\/battle\/vs(\/|$)/.test(pathname)) {
    return <VersusScreen matchId={parseMatchId(pathname)} />
  }
  if (pathname.startsWith('/battle')) {
    return <BattleScreen playerId={parsePlayerId(search)} />
  }
  return <LandingScreen />
}
