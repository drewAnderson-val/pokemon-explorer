import { fireEvent, render, screen } from '@testing-library/react'
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
  imageUrl: 'https://loremflickr.com/3266/1298?lock=1',
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

  it('draws a six-stat radar only when expanded, hidden from screen readers', () => {
    renderCard(false)
    expect(document.querySelector('[data-radar]')).toBeNull()
  })

  it('plots the radar from the six stats on a shared scale', () => {
    renderCard(true)
    const radar = document.querySelector('[data-radar]')!
    expect(radar).toHaveAttribute('aria-hidden', 'true')
    const shape = radar.querySelector('[data-radar-shape]')!
    const vertices = shape.getAttribute('points')!.trim().split(' ')
    expect(vertices).toHaveLength(6)
    // HP 80 of 255 on an 80px radius, straight up from the centre.
    expect(vertices[0]).toBe(`0.00,${(-(80 / 255) * 80).toFixed(2)}`)
    // The fill reads --type, so the card itself must provide it.
    expect(radar.closest('li')!.style.getPropertyValue('--type')).toBe(
      '#f08030'
    )
  })

  it('swaps a failed image for the letter fallback', () => {
    const { container } = render(
      <ul>
        <CreatureCard expanded={false} onToggle={() => {}} pokemon={pokemon} />
      </ul>
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(
      'https://loremflickr.com/480/360?lock=1'
    )
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
