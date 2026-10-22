import { useEffect, useRef } from 'react'

import type { Phase } from '@/lib/battle/flow'
import type { Cue } from '@/lib/battle/script'

import { playSound } from '@/lib/sound'

// What the wild and friend arenas share: focus, cue sounds and the keyboard.

// 'timing': the timing bar is up and focuses itself.
export type FocusTarget = 'timing' | Phase

export const caption = (text: string) => (
  <span className="text-caption text-ink-muted">{text}</span>
)

// Enter/Space still advance after a click elsewhere left focus on <body>.
export function useBodyAdvance(canAdvance: boolean, advance: () => void) {
  const advanceRef = useRef(advance)
  useEffect(() => {
    advanceRef.current = advance
  })
  useEffect(() => {
    if (!canAdvance) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target !== document.body) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      advanceRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canAdvance])
}

// Each message plays its cue once.
export function useCueSound(
  messageId: number,
  cue: Cue | undefined,
  sound: boolean
) {
  const played = useRef(-1)
  useEffect(() => {
    if (!sound || played.current === messageId) return
    played.current = messageId
    if (cue) playSound(cue)
  }, [cue, messageId, sound])
}

// Each phase hands focus to its control, so the keyboard never drops to <body>.
// `refresh` re-runs it when the same phase's menu changes (say, re-enabled).
export function usePhaseFocus(target: FocusTarget, refresh?: unknown) {
  const messageRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLButtonElement>(null)
  // The move to focus when the moves menu opens again.
  const lastMove = useRef(0)
  useEffect(() => {
    if (target === 'timing') return
    if (target === 'messages') messageRef.current?.focus()
    else if (target === 'end') endRef.current?.focus()
    else if (target === 'moves') {
      menuRef.current?.querySelectorAll('button')[lastMove.current]?.focus()
    } else {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('button:enabled')
        ?.focus()
    }
  }, [refresh, target])
  return { endRef, lastMove, menuRef, messageRef }
}
