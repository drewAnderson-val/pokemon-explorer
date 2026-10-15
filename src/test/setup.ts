import '@testing-library/jest-dom/vitest'
// jsdom has no IndexedDB; the Creature Lab saves cards there.
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import {
  MockIntersectionObserver,
  resetIntersectionObservers
} from './intersection-observer'

globalThis.IntersectionObserver = MockIntersectionObserver

afterEach(() => {
  cleanup()
  resetIntersectionObservers()
})
