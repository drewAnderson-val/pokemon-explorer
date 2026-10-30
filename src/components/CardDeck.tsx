import { useState } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import { cn } from '@/lib/utils'

import { CardBack } from './CardBack'
import { CreationCard } from './CreationCard'
import { Button } from './ui/button'

type CardDeckProps = {
  cards: Pokemon[]
  // The card just made in this visit: it's revealed with a flip, once.
  dealtId?: number
  drawing: boolean
  onAddToTeam: (creature: Pokemon) => void
  onDealt: () => void
  onDelete: (id: number) => void
  teamFull: boolean
  teamIds: ReadonlySet<number>
}

// Up to this many card edges peek out from under the top card.
const MAX_PEEKS = 2

// One card at a time, newest on top. While the lab draws, a face-down card
// shuffles on top of the deck; when the image arrives it turns over.
// Arrows flip through older cards, sliding in from the side you're heading.
export function CardDeck({
  cards,
  dealtId,
  drawing,
  onAddToTeam,
  onDealt,
  onDelete,
  teamFull,
  teamIds
}: CardDeckProps) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<'newer' | 'older'>()
  const [seenTopId, setSeenTopId] = useState(cards[0]?.id)

  // A new card arrived: jump back to the top so it's the one you see.
  const topId = cards[0]?.id
  if (topId !== seenTopId) {
    setSeenTopId(topId)
    setIndex(0)
    setDirection(undefined)
  }
  const current = Math.min(index, Math.max(cards.length - 1, 0))
  const card = cards[current]
  // While drawing, every saved card is under the face-down one.
  const below = drawing ? cards.length : cards.length - current - 1
  const peeks = Math.min(below, MAX_PEEKS)
  const flipping = !drawing && card !== undefined && card.id === dealtId

  const go = (to: number, towards: 'newer' | 'older') => {
    setDirection(towards)
    setIndex(to)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* isolate: the backs' negative z-index stays inside the deck. */}
      <div className="relative isolate pr-3 pb-3">
        {Array.from({ length: peeks }, (_, i) => (
          // Decorative card edges, each nudged further down and right.
          <span
            aria-hidden
            className="absolute inset-0 right-3 bottom-3 rounded-box frame-box bg-box"
            key={i}
            style={{
              transform: `translate(${(i + 1) * 6}px, ${(i + 1) * 6}px) rotate(${(i + 1) * 1.2}deg)`,
              zIndex: -1 - i
            }}
          />
        ))}
        <div
          aria-busy={drawing}
          aria-label="Custom cards"
          className="[perspective:1400px]"
          role="group"
        >
          {drawing ? (
            <>
              <CardBack className="animate-wobble" />
              <p className="sr-only" role="status">
                Drawing your creature…
              </p>
            </>
          ) : (
            card && (
              <div
                className={cn(
                  'relative [transform-style:preserve-3d]',
                  flipping && 'animate-flip-in',
                  !flipping && direction === 'older' && 'animate-from-older',
                  !flipping && direction === 'newer' && 'animate-from-newer'
                )}
                // Remount per card so each one plays its own entrance.
                key={card.id}
                onAnimationEnd={event => {
                  // animationend bubbles; only the flip itself counts.
                  if (flipping && event.target === event.currentTarget)
                    onDealt()
                }}
              >
                <CreationCard
                  className="[backface-visibility:hidden]"
                  creature={card}
                  onAddToTeam={onAddToTeam}
                  onDelete={onDelete}
                  onTeam={teamIds.has(card.id)}
                  teamFull={teamFull}
                />
                {flipping && (
                  <CardBack className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]" />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {cards.length > 1 && !drawing && (
        <div className="flex items-center justify-center gap-3">
          <Button
            aria-label="Newer card"
            disabled={current === 0}
            onClick={() => go(current - 1, 'newer')}
            variant="secondary"
          >
            ◀
          </Button>
          <p aria-live="polite" className="min-w-20 text-center text-label">
            {current + 1} of {cards.length}
          </p>
          <Button
            aria-label="Older card"
            disabled={current === cards.length - 1}
            onClick={() => go(current + 1, 'older')}
            variant="secondary"
          >
            ▶
          </Button>
        </div>
      )}
    </div>
  )
}
