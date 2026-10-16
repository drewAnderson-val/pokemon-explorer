export type WindowLimiter = ReturnType<typeof createWindowLimiter>

// Fixed-window counters kept in memory. They're per instance and reset on
// restart, so Cloud Run's max instance count bounds the real totals; good
// enough to cap a demo's spend without adding a datastore.
export function createWindowLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now
) {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return {
    // Counts the hit and returns true, or false when the key is over its limit.
    take(key: string) {
      const time = now()
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k)
      }
      let window = windows.get(key)
      if (!window || window.resetAt <= time) {
        window = { count: 0, resetAt: time + windowMs }
        windows.set(key, window)
      }
      if (window.count >= limit) return false
      window.count++
      return true
    }
  }
}
