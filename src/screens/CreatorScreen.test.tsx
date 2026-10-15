import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { CreatedCreature } from '@/lib/creature'

import { stubFetch } from '@/test/fake-api'
import { renderWithClient } from '@/test/render'

import { CreatorScreen } from './CreatorScreen'

const creature: CreatedCreature = {
  attack: 80,
  defense: 70,
  description: 'A sleepy fox',
  generation: 10,
  height: 0.6,
  hp: 55,
  imageUrl: 'data:image/png;base64,AAAA',
  isLegendary: false,
  name: 'Embercub',
  specialAttack: 90,
  specialDefense: 60,
  speed: 100,
  types: ['Fire'],
  weight: 9.5
}

describe('CreatorScreen', () => {
  it('sends the form and shows the creation with alt text and a download', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch(() => Response.json({ creature }))
    renderWithClient(<CreatorScreen />)

    const create = screen.getByRole('button', { name: 'Create' })
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText('Name'), 'Embercub')
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await user.type(screen.getByLabelText(/Description/), 'A sleepy fox')
    await user.click(create)

    const card = await screen.findByRole('listitem')
    expect(
      within(card).getByRole('img', { name: 'Generated artwork of Embercub' })
    ).toHaveAttribute('src', creature.imageUrl)
    expect(within(card).getByText('No.1001')).toBeInTheDocument()
    expect(
      within(card).getByRole('link', { name: 'Download image' })
    ).toHaveAttribute('download', 'embercub.png')

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      description: 'A sleepy fox',
      name: 'Embercub',
      types: ['Fire']
    })
  })

  it('allows at most two types', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderWithClient(<CreatorScreen />)

    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(screen.getByRole('button', { name: 'Ice' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Water' }))
    expect(screen.getByRole('button', { name: 'Ice' })).toBeEnabled()
  })

  it("shows the API's error message", async () => {
    const user = userEvent.setup()
    stubFetch(() =>
      Response.json(
        { error: "You've made a lot of creatures! Try again in an hour." },
        { status: 429 }
      )
    )
    renderWithClient(<CreatorScreen />)

    await user.type(screen.getByLabelText('Name'), 'Embercub')
    await user.click(screen.getByRole('button', { name: 'Fire' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You've made a lot of creatures! Try again in an hour."
    )
  })
})
