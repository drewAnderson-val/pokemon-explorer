import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useSlashToFocus } from './useSlashToFocus'

function Harness() {
  const ref = useRef<HTMLInputElement>(null)
  useSlashToFocus(ref)
  return (
    <>
      <input aria-label="search" ref={ref} />
      <input aria-label="other" />
      <button type="button">elsewhere</button>
    </>
  )
}

describe('useSlashToFocus', () => {
  it('focuses the search input when / is pressed elsewhere', async () => {
    render(<Harness />)
    screen.getByRole('button').focus()
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('search')).toHaveFocus()
    expect(screen.getByLabelText('search')).toHaveValue('')
  })

  it('types a slash while already in a field', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('other'), 'a/b')
    expect(screen.getByLabelText('other')).toHaveValue('a/b')
    await userEvent.type(screen.getByLabelText('search'), 'x/y')
    expect(screen.getByLabelText('search')).toHaveValue('x/y')
  })
})
