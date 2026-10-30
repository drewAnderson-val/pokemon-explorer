import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Pokemon } from '@/lib/pokemon'

import { CreatureCard } from './CreatureCard'

const pokemon: Pokemon = {
  attack: 10,
  defense: 20,
  description: 'Sleeps in warm sand.',
  generation: 4,
  height: 3.44,
  hp: 80,
  id: 4,
  imageUrl:
    'https://storage.googleapis.com/finny-take-home-creature-images/catalog/4.webp',
  isLegendary: true,
  name: 'Geovanni',
  specialAttack: 30,
  specialDefense: 40,
  speed: 50,
  types: ['Fire', 'Flying'],
  weight: 812
}

function renderCard(expanded: boolean, overrides: Partial<Pokemon> = {}) {
  const onToggle = vi.fn()
  render(
    <ul>
      <CreatureCard
        expanded={expanded}
        onToggle={onToggle}
        pokemon={{ ...pokemon, ...overrides }}
      />
    </ul>
  )
  return { button: screen.getByRole('button', { name: 'Geovanni' }), onToggle }
}

describe('CreatureCard', () => {
  it('shows the collapsed summary', () => {
    const { button } = renderCard(false)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('No.004')).toBeInTheDocument()
    expect(screen.getByText('Fire')).toBeInTheDocument()
    expect(screen.getByText('Flying')).toBeInTheDocument()
    expect(screen.getByText('80/80')).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()
    expect(screen.queryByText('Sleeps in warm sand.')).not.toBeInTheDocument()
  })

  it.each([false, true])(
    'has no more/less corner tag (expanded: %s)',
    expanded => {
      renderCard(expanded)
      expect(screen.queryByText(/more|less/i)).not.toBeInTheDocument()
    }
  )

  it('toggles by id', async () => {
    const { button, onToggle } = renderCard(false)
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledWith(4)
  })

  it('reveals stats, meta and description when expanded', () => {
    const { button } = renderCard(true)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const details = document.getElementById(
      button.getAttribute('aria-controls')!
    )
    expect(details).toBeVisible()
    expect(screen.getByText('230')).toBeInTheDocument() // TOTAL incl. HP
    expect(screen.getByText('GEN 4')).toBeInTheDocument()
    expect(screen.getByText('3.4 m')).toBeInTheDocument()
    expect(screen.getByText('812.0 kg')).toBeInTheDocument()
    expect(screen.getByText('Sleeps in warm sand.')).toBeInTheDocument()
  })

  it('links to a battle only when expanded', () => {
    renderCard(false)
    expect(screen.queryByRole('link', { name: /Battle/ })).toBeNull()
    cleanup()
    renderCard(true)
    expect(
      screen.getByRole('link', { name: 'Battle with Geovanni' })
    ).toHaveAttribute('href', '/battle?id=4')
  })

  it('adds to the team from an expanded card', async () => {
    const onAddToTeam = vi.fn()
    render(
      <ul>
        <CreatureCard
          expanded
          onAddToTeam={onAddToTeam}
          onToggle={() => {}}
          pokemon={pokemon}
        />
      </ul>
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add Geovanni to team' })
    )
    expect(onAddToTeam).toHaveBeenCalledWith(pokemon)
  })

  it('shows a creature already on the team as added', () => {
    render(
      <ul>
        <CreatureCard
          expanded
          onAddToTeam={() => {}}
          onTeam
          onToggle={() => {}}
          pokemon={pokemon}
        />
      </ul>
    )
    expect(screen.getByRole('button', { name: 'On your team' })).toBeDisabled()
  })

  it('disables adding when the team is full', () => {
    render(
      <ul>
        <CreatureCard
          expanded
          onAddToTeam={() => {}}
          onToggle={() => {}}
          pokemon={pokemon}
          teamFull
        />
      </ul>
    )
    expect(screen.getByRole('button', { name: 'Team full' })).toBeDisabled()
  })

  // Images are already card-sized copies in the bucket: the URL is used as is,
  // even one whose path happens to end in /<number>/<number>.
  it('uses the image URL as given', () => {
    const { container } = render(
      <ul>
        <CreatureCard
          expanded={false}
          onToggle={() => {}}
          pokemon={{ ...pokemon, imageUrl: 'https://img.test/100/200' }}
        />
      </ul>
    )
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'https://img.test/100/200'
    )
  })

  it('swaps a failed image for the letter fallback', () => {
    const { container } = render(
      <ul>
        <CreatureCard expanded={false} onToggle={() => {}} pokemon={pokemon} />
      </ul>
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(pokemon.imageUrl)
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('treats a missing image and isLegendary as absent', () => {
    renderCard(false, {
      imageUrl: '',
      isLegendary: undefined,
      types: ['Water']
    })
    expect(screen.getByText('G')).toBeInTheDocument()
    expect(screen.queryByText('Legend')).not.toBeInTheDocument()
  })
})
