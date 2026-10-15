// A value saved in localStorage that React can subscribe to, shared by every
// screen and kept in sync across tabs. Blocked storage (private mode, disabled
// site data) falls back to memory for the session.
type Options<T> = {
  empty: T
  key: string
  parse: (raw: null | string) => T
  serialize: (value: T) => string
}

export function createLocalStore<T>({
  empty,
  key,
  parse,
  serialize
}: Options<T>) {
  const listeners = new Set<() => void>()
  // The last value read or written, used when storage is blocked.
  let memory: null | string = null
  // Cached by the raw string so useSyncExternalStore gets a stable snapshot.
  let snapshot: { raw: null | string; value: T } = { raw: null, value: empty }

  function readRaw() {
    try {
      memory = window.localStorage.getItem(key)
    } catch {
      // Blocked storage: fall back to the last known value.
    }
    return memory
  }

  function read() {
    const raw = readRaw()
    if (raw !== snapshot.raw) snapshot = { raw, value: parse(raw) }
    return snapshot.value
  }

  function update(change: (value: T) => T) {
    const raw = serialize(change(read()))
    memory = raw
    try {
      window.localStorage.setItem(key, raw)
    } catch {
      // Blocked storage: the in-memory copy carries the session.
    }
    listeners.forEach(listener => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  return { empty, read, subscribe, update }
}
