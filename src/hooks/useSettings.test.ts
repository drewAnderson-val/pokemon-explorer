import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parseSettings, SETTINGS_STORAGE_KEY, useSettings } from './useSettings'

const DEFAULTS = { classic: true, sound: false, timing: true }

describe('parseSettings', () => {
  it('defaults to classic screen on, sound off, timing on', () => {
    expect(parseSettings(null)).toEqual(DEFAULTS)
    expect(parseSettings('{oops')).toEqual(DEFAULTS)
  })

  it('keeps valid fields and ignores the rest', () => {
    expect(
      parseSettings('{"classic":false,"sound":true,"timing":"x"}')
    ).toEqual({ classic: false, sound: true, timing: true })
  })

  it('reads a save from before the classic screen existed', () => {
    expect(parseSettings('{"sound":true,"timing":false}')).toEqual({
      classic: true,
      sound: true,
      timing: false
    })
  })
})

describe('useSettings', () => {
  it('saves a change and reads it back', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current[0]).toEqual(DEFAULTS)
    act(() => result.current[1](s => ({ ...s, sound: true })))
    expect(result.current[0].sound).toBe(true)
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual({
      ...DEFAULTS,
      sound: true
    })
  })
})
