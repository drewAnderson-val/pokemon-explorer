import { describe, expect, it, vi } from 'vitest'

import { notesFor, playSound, SOUNDS } from './sound'

describe('sound', () => {
  it('has a short tune for every sound', () => {
    for (const sound of SOUNDS) {
      const notes = notesFor(sound)
      expect(notes.length).toBeGreaterThan(0)
      const total = notes.reduce((sum, note) => sum + note.ms, 0)
      expect(total).toBeLessThanOrEqual(900)
    }
  })

  it('does nothing (and never throws) without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playSound('hit')).not.toThrow()
  })

  it('schedules one oscillator per note when audio is available', () => {
    const oscillators: { start: ReturnType<typeof vi.fn> }[] = []
    const param = {
      exponentialRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn()
    }
    class FakeContext {
      currentTime = 0
      destination = {}
      state = 'running'
      createGain() {
        return { connect: vi.fn(), gain: param }
      }
      createOscillator() {
        const osc = {
          connect: vi.fn(),
          frequency: param,
          start: vi.fn(),
          stop: vi.fn(),
          type: 'square'
        }
        oscillators.push(osc)
        return osc
      }
      resume() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('AudioContext', FakeContext)
    playSound('victory')
    expect(oscillators).toHaveLength(notesFor('victory').length)
    expect(oscillators.every(o => o.start.mock.calls.length === 1)).toBe(true)
  })
})
