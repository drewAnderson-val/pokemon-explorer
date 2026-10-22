import { vi } from 'vitest'

type Listener = (event: MessageEvent) => void

// jsdom has no EventSource. This one records what the code under test opens
// and lets a test push named events into it.
export class FakeEventSource {
  static last: FakeEventSource | null = null

  closed = false
  onerror: (() => void) | null = null
  readonly url: string
  private listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.last = this
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close() {
    this.closed = true
  }

  emit(type: 'gone' | 'view', data?: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data ?? null) })
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

export function stubEventSource() {
  FakeEventSource.last = null
  vi.stubGlobal('EventSource', FakeEventSource)
  return FakeEventSource
}
