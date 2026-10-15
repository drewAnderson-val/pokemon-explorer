import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parseSettings, SETTINGS_STORAGE_KEY, useSettings } from './useSettings'

describe('parseSettings', () => {
  it('defaults to sound off, timing on', () => {
    expect(parseSettings(null)).toEqual({ sound: false, timing: true })
    expect(parseSettings('{oops')).toEqual({ sound: false, timing: true })
  })

  it('keeps valid fields and ignores the rest', () => {
    expect(parseSettings('{"sound":true,"timing":"x"}')).toEqual({
      sound: true,
      timing: true
    })
  })
})

describe('useSettings', () => {
  it('saves a change and reads it back', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current[0]).toEqual({ sound: false, timing: true })
    act(() => result.current[1](s => ({ ...s, sound: true })))
    expect(result.current[0].sound).toBe(true)
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual({
      sound: true,
      timing: true
    })
  })
})
