import { useEffect, useEffectEvent, useRef } from 'react'

type Options = { enabled: boolean; onLoadMore: () => void }

// Calls onLoadMore when the sentinel is within 600px of the viewport. The
// observer is recreated whenever `enabled` flips back on (after each page), and
// a new observer reports the current state immediately. So if the sentinel is
// still in view on a tall screen, loading continues instead of stalling.
export function useLoadMoreSentinel({ enabled, onLoadMore }: Options) {
  const ref = useRef<HTMLDivElement>(null)
  const loadMore = useEffectEvent(onLoadMore)

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '0px 0px 600px 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}
