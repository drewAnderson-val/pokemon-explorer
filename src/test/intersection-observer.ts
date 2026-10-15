type Observer = {
  callback: IntersectionObserverCallback
  elements: Set<Element>
  instance: IntersectionObserver
}

const observers = new Set<Observer>()
let intersecting = false

// jsdom has no IntersectionObserver. Tests flip `intersecting` to simulate the
// load-more sentinel entering or staying in view.
export class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly scrollMargin = ''
  readonly thresholds = []
  #observer: Observer

  constructor(callback: IntersectionObserverCallback) {
    this.#observer = { callback, elements: new Set(), instance: this }
    observers.add(this.#observer)
  }

  disconnect() {
    this.#observer.elements.clear()
    observers.delete(this.#observer)
  }

  observe(element: Element) {
    this.#observer.elements.add(element)
    // Real observers report the initial state right after observe().
    queueMicrotask(() => {
      if (this.#observer.elements.has(element)) notify(this.#observer, element)
    })
  }

  takeRecords() {
    return []
  }

  unobserve(element: Element) {
    this.#observer.elements.delete(element)
  }
}

export function resetIntersectionObservers() {
  intersecting = false
  observers.clear()
}

export function setIntersecting(value: boolean) {
  intersecting = value
  for (const observer of observers) {
    for (const element of observer.elements) notify(observer, element)
  }
}

function notify(observer: Observer, element: Element) {
  observer.callback(
    [
      {
        isIntersecting: intersecting,
        target: element
      } as IntersectionObserverEntry
    ],
    observer.instance
  )
}
