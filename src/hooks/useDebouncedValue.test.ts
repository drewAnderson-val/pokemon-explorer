import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('updates only after the value has been stable for the delay', () => {
    const { rerender, result } = renderHook(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: 'f' } }
    )
    rerender({ value: 'fi' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'fir' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('f')
    act(() => vi.advanceTimersByTime(50))
    expect(result.current).toBe('fir')
  })
})
