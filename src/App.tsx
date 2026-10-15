import { CreatorScreen } from '@/screens/CreatorScreen'
import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'

// Three screens and plain links between them: a router would be overkill.
export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/explore')) return <ExplorerScreen />
  if (path.startsWith('/create')) return <CreatorScreen />
  return <LandingScreen />
}
