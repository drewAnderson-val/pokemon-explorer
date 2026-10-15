import { useState } from 'react'

import type { Pokemon } from '@/lib/pokemon'

import { CreationCard } from './CreationCard'
import { Button } from './ui/button'

type CardDeckProps = {
  cards: Pokemon[]
  drawing: boolean
  onDelete: (id: number) => void
}

// Up to this many card edges peek out from under the top card.
const MAX_PEEKS = 2

// One card at a time, newest on top: a new creation is dealt onto the deck
// instead of pushing a list down the page. Arrows flip through older cards.
export function CardDeck({ cards, drawing, onDelete }: CardDeckProps) {
  const [index, setIndex] = useState(0)
  const [seenTopId, setSeenTopId] = useState(cards[0]?.id)

  // A new card arrived: jump back to the top so it's the one you see.
  const topId = cards[0]?.id
  if (topId !== seenTopId) {
    setSeenTopId(topId)
    setIndex(0)
  }
  const current = Math.min(index, Math.max(cards.length - 1, 0))
  const card = cards[current]
  // While drawing, every saved card is under the placeholder.
  const below = drawing ? cards.length : cards.length - current - 1
  const peeks = Math.min(below, MAX_PEEKS)

  return (
    <div className="flex flex-col gap-4">
      {/* isolate: the backs' negative z-index stays inside the deck. */}
      <div className="relative isolate pr-3 pb-3">
        {Array.from({ length: peeks }, (_, i) => (
          // Decorative card backs, each nudged further down and right.
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
        <ul aria-busy={drawing} aria-label="Custom cards">
          {drawing ? (
            <li
              aria-label="Drawing your creature"
              className="@container rounded-box frame-box bg-box p-3.5"
            >
              <div className="grid gap-3 @xl:grid-cols-2 @xl:gap-4">
                <span className="block aspect-square animate-pulse-soft rounded-inset bg-inset" />
                <span className="block h-6 w-2/3 animate-pulse-soft rounded-tag bg-inset" />
              </div>
            </li>
          ) : (
            card && (
              <CreationCard
                className={current === 0 ? 'animate-deal' : undefined}
                creature={card}
                // Remount per card so the deal plays for each new top card.
                key={card.id}
                onDelete={onDelete}
              />
            )
          )}
        </ul>
      </div>

      {cards.length > 1 && !drawing && (
        <div className="flex items-center justify-center gap-3">
          <Button
            aria-label="Newer card"
            disabled={current === 0}
            onClick={() => setIndex(current - 1)}
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
            onClick={() => setIndex(current + 1)}
            variant="secondary"
          >
            ▶
          </Button>
        </div>
      )}
    </div>
  )
}
