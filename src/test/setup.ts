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
  // Server tests run in Node, which has no window storage.
  if (typeof window !== 'undefined') window.localStorage.clear()
  resetIntersectionObservers()
})
