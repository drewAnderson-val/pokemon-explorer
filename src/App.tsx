import { useAuth } from '@/hooks/useAuth'
import { BattleScreen, parsePlayerId } from '@/screens/BattleScreen'
import { CreatorScreen } from '@/screens/CreatorScreen'
import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'
import { LoginScreen } from '@/screens/LoginScreen'
import { parseMatchId, VersusScreen } from '@/screens/VersusScreen'

// A few screens and plain links between them: a router would be overkill.
export default function App() {
  const session = useAuth()
  const { hash, pathname, search } = window.location
  if (pathname === '/login') {
    return <LoginScreen next={new URLSearchParams(search).get('next')} />
  }
  // Everything is behind an account: sign in first, then carry on to the page
  // you opened (an invite link, say).
  if (!session) return <LoginScreen next={pathname + search + hash} />
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
