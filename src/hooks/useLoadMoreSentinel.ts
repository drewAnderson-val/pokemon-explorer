import { useEffect, useEffectEvent, useRef } from 'react'

type Options = { enabled: boolean; onLoadMore: () => void; pageCount: number }

// Calls onLoadMore when the sentinel is within 600px of the viewport. The
// observer is recreated after every loaded page (`pageCount`), and a new
// observer reports the current state immediately. So if the sentinel is still
// in view on a tall screen, loading continues instead of stalling. Keying on
// `enabled` alone isn't enough: a fast response can start and finish a fetch
// within one render, so `enabled` never visibly flips.
export function useLoadMoreSentinel({
  enabled,
  onLoadMore,
  pageCount
}: Options) {
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
  }, [enabled, pageCount])

  return ref
}
