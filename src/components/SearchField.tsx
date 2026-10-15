import { type Ref, useId } from 'react'

import { MAX_SEARCH_LENGTH } from '@/lib/pokemon'

import { DialogBox } from './DialogBox'

type SearchFieldProps = {
  onChange: (value: string) => void
  ref?: Ref<HTMLInputElement>
  value: string
}

export function SearchField({ onChange, ref, value }: SearchFieldProps) {
  const id = useId()
  return (
    <DialogBox className="min-w-0 flex-1">
      <label className="block text-body-lg" htmlFor={id}>
        What will you look for?
      </label>
      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className="text-body-lg">
          ▶
        </span>
        <input
          autoComplete="off"
          className="w-full min-w-0 border-b-2 border-ink bg-transparent py-1 text-body-lg outline-none placeholder:text-ink-muted focus-visible:focus-ring"
          id={id}
          maxLength={MAX_SEARCH_LENGTH}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape' && value !== '') {
              event.preventDefault()
              onChange('')
            }
          }}
          placeholder="Name, type, or description"
          ref={ref}
          type="search"
          value={value}
        />
        <kbd
          aria-hidden
          className="hidden rounded-tag frame-tag px-1.5 text-caption sm:inline"
        >
          /
        </kbd>
      </div>
    </DialogBox>
  )
}
