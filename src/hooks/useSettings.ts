import { useSyncExternalStore } from 'react'

import { createLocalStore } from '@/lib/localStore'

// classic: the battle screen in the original handheld's four greens.
export type Settings = { classic: boolean; sound: boolean; timing: boolean }

export const SETTINGS_STORAGE_KEY = 'pokemon-explorer:settings'

// Sound starts off: pages that make noise unasked are a nuisance.
const DEFAULTS: Settings = { classic: true, sound: false, timing: true }

const flag = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

// Saves from before a setting existed keep their other choices.
export function parseSettings(raw: null | string): Settings {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null
    if (typeof data !== 'object' || data === null) return DEFAULTS
    const { classic, sound, timing } = data as Record<string, unknown>
    return {
      classic: flag(classic, DEFAULTS.classic),
      sound: flag(sound, DEFAULTS.sound),
      timing: flag(timing, DEFAULTS.timing)
    }
  } catch {
    return DEFAULTS
  }
}

const store = createLocalStore<Settings>({
  empty: DEFAULTS,
  key: SETTINGS_STORAGE_KEY,
  parse: parseSettings,
  serialize: settings => JSON.stringify(settings)
})

export function useSettings() {
  const settings = useSyncExternalStore(
    store.subscribe,
    store.read,
    () => DEFAULTS
  )
  return [settings, store.update] as const
}
