import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSteppedNumber } from './useSteppedNumber'
import { useTypewriter } from './useTypewriter'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// Each tick schedules the next from an effect, which runs when act() ends,
// so step one tick per act().
function tick(ms: number, times = 1) {
  for (let i = 0; i < times; i++) act(() => vi.advanceTimersByTime(ms))
}

describe('useTypewriter', () => {
  it('types a character at a time and can be finished early', () => {
    const { result } = renderHook(() => useTypewriter('Hello', '1', false))
    expect(result.current.shown).toBe('')
    tick(22, 2)
    expect(result.current.shown).toBe('He')
    expect(result.current.done).toBe(false)
    act(() => result.current.finish())
    expect(result.current).toMatchObject({ done: true, shown: 'Hello' })
  })

  it('restarts for a new message id and is instant when asked', () => {
    const { rerender, result } = renderHook(
      ({ id, instant }) => useTypewriter('Again', id, instant),
      { initialProps: { id: '1', instant: false } }
    )
    tick(22, 5)
    expect(result.current.done).toBe(true)
    rerender({ id: '2', instant: false })
    expect(result.current.shown).toBe('')
    rerender({ id: '3', instant: true })
    expect(result.current).toMatchObject({ done: true, shown: 'Again' })
  })
})

describe('useSteppedNumber', () => {
  it('drains toward the target in steps of max / 48', () => {
    const { rerender, result } = renderHook(
      ({ target }) => useSteppedNumber(target, 96, false),
      { initialProps: { target: 96 } }
    )
    rerender({ target: 80 })
    expect(result.current).toBe(96)
    tick(40)
    expect(result.current).toBe(94)
    tick(40, 7)
    expect(result.current).toBe(80)
    tick(40, 3)
    expect(result.current).toBe(80)
  })

  it('jumps straight to the target when instant', () => {
    const { rerender, result } = renderHook(
      ({ target }) => useSteppedNumber(target, 96, true),
      { initialProps: { target: 96 } }
    )
    rerender({ target: 10 })
    expect(result.current).toBe(10)
  })
})
