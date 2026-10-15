import type { Cue } from './battle/script'

// Original retro beeps synthesised with Web Audio: no files, no library.
export type Sound = 'victory' | Cue

type Note = { freq: number; ms: number; wave: OscillatorType }

const sq = (freq: number, ms: number): Note => ({ freq, ms, wave: 'square' })
const tri = (freq: number, ms: number): Note => ({ freq, ms, wave: 'triangle' })

const TUNES: Record<Sound, Note[]> = {
  breakFree: [sq(392, 60), sq(262, 120)],
  caught: [sq(523, 70), sq(659, 70), sq(784, 70), sq(1047, 160)],
  crit: [sq(110, 60), sq(82, 120)],
  faint: [tri(440, 90), tri(330, 90), tri(220, 90), tri(147, 200)],
  hit: [sq(196, 50), sq(147, 60)],
  levelUp: [sq(523, 80), sq(659, 80), sq(784, 80), sq(1047, 80), sq(1319, 200)],
  shake: [tri(330, 50), tri(294, 50)],
  super: [sq(659, 50), sq(880, 50), sq(1175, 90)],
  throw: [tri(523, 40), tri(784, 40), tri(1047, 60)],
  victory: [sq(784, 120), sq(784, 120), sq(1047, 320)],
  weak: [tri(220, 80), tri(196, 100)]
}

export const SOUNDS = Object.keys(TUNES) as Sound[]

const VOLUME = 0.06

let context: AudioContext | null = null

export const notesFor = (sound: Sound) => TUNES[sound]

export function playSound(sound: Sound) {
  const ctx = getContext()
  if (!ctx) return
  let at = ctx.currentTime
  for (const note of TUNES[sound]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = note.wave
    osc.frequency.setValueAtTime(note.freq, at)
    gain.gain.setValueAtTime(VOLUME, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + note.ms / 1000)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + note.ms / 1000)
    at += note.ms / 1000
  }
}

// Browsers only allow audio after a user gesture, so the sound toggle calls
// this from its click handler.
export function unlockAudio() {
  const ctx = getContext()
  if (ctx?.state === 'suspended') void ctx.resume()
}

function getContext() {
  if (context) return context
  const AudioCtor = (globalThis as { AudioContext?: typeof AudioContext })
    .AudioContext
  if (typeof AudioCtor !== 'function') return null
  try {
    context = new AudioCtor()
  } catch {
    return null
  }
  return context
}
