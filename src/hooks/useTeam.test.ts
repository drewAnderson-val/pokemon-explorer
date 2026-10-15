import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { addMember, type TeamMember } from '@/lib/team/team'

import { TEAM_STORAGE_KEY, useTeam } from './useTeam'

const member: TeamMember = {
  creatureId: 1,
  hp: null,
  level: 5,
  uid: 'a',
  xp: 125
}

describe('useTeam', () => {
  it('saves to localStorage and reads it back', () => {
    const { result } = renderHook(() => useTeam())
    expect(result.current[0]).toEqual([])
    act(() => result.current[1](team => addMember(team, member)))
    expect(result.current[0]).toEqual([member])
    expect(JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY)!)).toEqual({
      members: [member],
      version: 1
    })
  })

  it('ignores a corrupt save', () => {
    localStorage.setItem(TEAM_STORAGE_KEY, '{nope')
    const { result } = renderHook(() => useTeam())
    expect(result.current[0]).toEqual([])
  })

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useTeam())
    act(() => {
      localStorage.setItem(
        TEAM_STORAGE_KEY,
        JSON.stringify({ members: [member], version: 1 })
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: TEAM_STORAGE_KEY })
      )
    })
    expect(result.current[0]).toEqual([member])
  })

  it('keeps working in memory when storage is blocked', () => {
    // Storage readable at first (empty), then blocked mid-session.
    renderHook(() => useTeam()).unmount()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { result } = renderHook(() => useTeam())
    act(() => result.current[1](team => addMember(team, member)))
    expect(result.current[0]).toEqual([member])
  })
})
