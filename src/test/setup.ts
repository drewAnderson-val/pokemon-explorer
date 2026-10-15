import '@testing-library/jest-dom/vitest'
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
