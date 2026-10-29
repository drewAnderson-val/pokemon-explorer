import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { teamStatus } from '@/lib/team/serverTeam'
import { addMember, type TeamMember } from '@/lib/team/team'
import { stubFetch } from '@/test/fake-api'
import { seedTeam, serverTeam } from '@/test/fake-server'
import { signIn } from '@/test/session'

import { useTeam } from './useTeam'

const member = (creatureId: number, uid = `c${creatureId}`): TeamMember => ({
  creatureId,
  hp: null,
  level: 5,
  uid,
  xp: 125
})

describe('useTeam', () => {
  it('is empty and sends nothing when signed out', () => {
    const fetchMock = stubFetch()
    const { result } = renderHook(() => useTeam())
    act(() => result.current[1](team => addMember(team, member(1))))
    expect(result.current[0]).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads the signed-in user’s team from the API', async () => {
    seedTeam([member(4, 's9')])
    signIn()
    stubFetch()
    const { result } = renderHook(() => useTeam())
    await waitFor(() => expect(result.current[0]).toEqual([member(4, 's9')]))
  })

  it('shows a change at once, then takes the server’s version', async () => {
    signIn()
    const fetchMock = stubFetch()
    const { result } = renderHook(() => useTeam())
    await waitFor(() => expect(teamStatus.read().loaded).toBe(true))

    act(() => result.current[1](team => addMember(team, member(1, 'local'))))
    // Optimistic: there before the server answers.
    expect(result.current[0].map(m => m.creatureId)).toEqual([1])

    await waitFor(() => expect(result.current[0][0].uid).not.toBe('local'))
    // The server assigned the uid and the starting stats.
    expect(result.current[0]).toEqual(serverTeam())
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      members: [{ creatureId: 1, uid: 'local' }]
    })
  })

  it('rolls back and reports a change the server refuses', async () => {
    seedTeam([member(1)])
    signIn()
    stubFetch()
    const { result } = renderHook(() => useTeam())
    await waitFor(() => expect(result.current[0]).toHaveLength(1))

    // The same creature twice: the server says no.
    act(() => result.current[1](team => [...team, member(1, 'dupe')]))
    await waitFor(() =>
      expect(teamStatus.read().error).toBe(
        'Each creature can only be on the team once'
      )
    )
    expect(result.current[0]).toEqual([member(1)])
  })

  it('applies quick changes in order', async () => {
    signIn()
    stubFetch()
    const { result } = renderHook(() => useTeam())
    await waitFor(() => expect(teamStatus.read().loaded).toBe(true))

    act(() => {
      result.current[1](team => addMember(team, member(1, 'a')))
      result.current[1](team => addMember(team, member(2, 'b')))
    })
    await waitFor(() =>
      expect(serverTeam().map(m => m.creatureId)).toEqual([1, 2])
    )
    await waitFor(() =>
      expect(result.current[0].map(m => m.creatureId)).toEqual([1, 2])
    )
  })
})
