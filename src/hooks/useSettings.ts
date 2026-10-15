import { useSyncExternalStore } from 'react'

import { createLocalStore } from '@/lib/localStore'

export type Settings = { sound: boolean; timing: boolean }

export const SETTINGS_STORAGE_KEY = 'pokemon-explorer:settings'

// Sound starts off: pages that make noise unasked are a nuisance.
const DEFAULTS: Settings = { sound: false, timing: true }

export function parseSettings(raw: null | string): Settings {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null
    if (typeof data !== 'object' || data === null) return DEFAULTS
    const { sound, timing } = data as Record<string, unknown>
    return {
      sound: typeof sound === 'boolean' ? sound : DEFAULTS.sound,
      timing: typeof timing === 'boolean' ? timing : DEFAULTS.timing
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
