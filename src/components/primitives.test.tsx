import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { SortKey } from '@/lib/pokemon'

import { SearchField } from './SearchField'
import { SortMenu } from './SortMenu'
import { StatusBox } from './StatusBox'
import { TypeBadge } from './TypeBadge'
import { TypeFilterChip } from './TypeFilterChip'

describe('TypeBadge', () => {
  it('writes the type name and passes the type colors', () => {
    render(<TypeBadge type="Ghost" />)
    const badge = screen.getByText('Ghost')
    expect(badge.style.getPropertyValue('--type')).toBe('#705898')
    expect(badge.style.getPropertyValue('--type-text')).toBe('#ffffff')
  })
})

describe('TypeFilterChip', () => {
  it('is a toggle button labelled with the type', async () => {
    const onPress = vi.fn()
    render(<TypeFilterChip onPress={onPress} pressed={false} type="Fire" />)
    const chip = screen.getByRole('button', { name: 'Fire', pressed: false })
    await userEvent.click(chip)
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('labels the empty type as All', () => {
    render(<TypeFilterChip onPress={() => {}} pressed type={null} />)
    expect(
      screen.getByRole('button', { name: 'All', pressed: true })
    ).toBeInTheDocument()
  })
})

describe('SortMenu', () => {
  it('marks the selected option and reports changes', async () => {
    const onChange = vi.fn<(value: SortKey) => void>()
    render(<SortMenu onChange={onChange} value="id" />)
    expect(screen.getByRole('group', { name: 'Sort by' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'No.', pressed: true })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Strongest' }))
    expect(onChange).toHaveBeenCalledWith('total')
  })
})

describe('SearchField', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return <SearchField onChange={setValue} value={value} />
  }

  it('has a real label and clears on Escape', async () => {
    render(<Harness />)
    const input = screen.getByLabelText('What will you look for?')
    expect(input).toHaveAttribute('placeholder', 'Name, type, or description')
    expect(input).toHaveAttribute('maxLength', '100')
    await userEvent.type(input, 'fire')
    expect(input).toHaveValue('fire')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })
})

describe('StatusBox', () => {
  it('announces errors and retries', async () => {
    const onAction = vi.fn()
    render(<StatusBox kind="error" onAction={onAction} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The connection fled! Try again.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('offers to clear filters when empty', () => {
    render(<StatusBox kind="empty" onAction={() => {}} />)
    expect(
      screen.getByText('But nothing appeared! Try another type.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear filters' })
    ).toBeInTheDocument()
  })

  it('shows end and loading copy with no action', () => {
    const { rerender } = render(<StatusBox kind="end" />)
    expect(
      screen.getByText("That's every creature on file!")
    ).toBeInTheDocument()
    rerender(<StatusBox kind="loading" />)
    expect(screen.getByText('More creatures appeared…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
