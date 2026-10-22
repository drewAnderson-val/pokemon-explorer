import { vi } from 'vitest'

type Listener = (event: MessageEvent) => void

// jsdom has no EventSource. This one records what the code under test opens
// and lets a test push named events (and errors) into it.
export class FakeEventSource {
  static readonly CLOSED = 2
  static readonly CONNECTING = 0
  static last: FakeEventSource | null = null
  static readonly OPEN = 1

  closed = false
  onerror: (() => void) | null = null
  readyState = FakeEventSource.CONNECTING
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
    this.readyState = FakeEventSource.CLOSED
  }

  emit(type: 'gone' | 'replaced' | 'view', data?: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data ?? null) })
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  // An error as the browser reports it: CONNECTING while it retries, CLOSED
  // once it has given up.
  fail(readyState: number) {
    this.readyState = readyState
    const event = new MessageEvent('error')
    for (const listener of this.listeners.get('error') ?? []) listener(event)
    this.onerror?.()
  }
}

export function stubEventSource() {
  FakeEventSource.last = null
  vi.stubGlobal('EventSource', FakeEventSource)
  return FakeEventSource
}
