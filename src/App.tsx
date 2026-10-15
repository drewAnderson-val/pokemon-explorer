import { ExplorerScreen } from '@/screens/ExplorerScreen'
import { LandingScreen } from '@/screens/LandingScreen'

// Two screens and plain links between them: a router would be overkill.
export default function App() {
  return window.location.pathname.startsWith('/explore') ? (
    <ExplorerScreen />
  ) : (
    <LandingScreen />
  )
}
