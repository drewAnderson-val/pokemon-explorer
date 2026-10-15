import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useId, useRef, useState } from 'react'

import { CreationCard } from '@/components/CreationCard'
import { DialogBox } from '@/components/DialogBox'
import { TypeFilterChip } from '@/components/TypeFilterChip'
import { Button } from '@/components/ui/button'
import { createCreature } from '@/lib/api'
import {
  MAX_CREATURE_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH
} from '@/lib/creature'
import { type Pokemon, POKEMON_TYPES, type PokemonType } from '@/lib/pokemon'

// Creations continue the catalog's numbering; they live only in this tab.
const FIRST_CREATION_ID = 1001

const field =
  'w-full min-w-0 border-b-2 border-ink bg-transparent py-1 text-body-lg outline-none placeholder:text-ink-muted focus-visible:focus-ring'

export function CreatorScreen() {
  const nameId = useId()
  const descriptionId = useId()
  const [name, setName] = useState('')
  const [types, setTypes] = useState<PokemonType[]>([])
  const [description, setDescription] = useState('')
  const [creations, setCreations] = useState<Pokemon[]>([])
  const nextId = useRef(FIRST_CREATION_ID)

  const create = useMutation({
    mutationFn: createCreature,
    onSuccess: ({ creature }) => {
      const id = nextId.current++
      setCreations(previous => [{ ...creature, id }, ...previous])
    }
  })

  const toggleType = (type: PokemonType) =>
    setTypes(previous =>
      previous.includes(type)
        ? previous.filter(t => t !== type)
        : [...previous, type]
    )

  const canSubmit = name.trim() !== '' && types.length > 0 && !create.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (canSubmit) create.mutate({ description, name, types })
  }

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6 pb-16 xs:px-6 lg:px-14 lg:pt-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <DialogBox>
          <h1 className="text-heading font-bold uppercase">Creature Lab</h1>
          <p className="mt-1 text-caption text-ink-muted">
            Describe a creature and the lab will draw it.
          </p>
        </DialogBox>
        <a
          className="inline-flex h-11 items-center rounded-tag frame-tag bg-box px-4 text-label font-bold uppercase hover:bg-inset focus-visible:focus-ring"
          href="/explore"
        >
          ◀ Explorer
        </a>
      </header>

      <form onSubmit={submit}>
        <DialogBox className="flex flex-col gap-5">
          <div>
            <label className="block text-body-lg" htmlFor={nameId}>
              Name
            </label>
            <input
              autoComplete="off"
              className={field}
              id={nameId}
              maxLength={MAX_NAME_LENGTH}
              onChange={event => setName(event.target.value)}
              placeholder="Embercub"
              required
              value={name}
            />
          </div>

          <fieldset className="min-w-0">
            <legend className="text-body-lg">
              Type{' '}
              <span className="text-caption text-ink-muted">
                (pick up to {MAX_CREATURE_TYPES})
              </span>
            </legend>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {POKEMON_TYPES.map(type => {
                const pressed = types.includes(type)
                return (
                  <TypeFilterChip
                    disabled={!pressed && types.length >= MAX_CREATURE_TYPES}
                    key={type}
                    onPress={() => toggleType(type)}
                    pressed={pressed}
                    type={type}
                  />
                )
              })}
            </div>
          </fieldset>

          <div>
            <label className="block text-body-lg" htmlFor={descriptionId}>
              Description{' '}
              <span className="text-caption text-ink-muted">(optional)</span>
            </label>
            <textarea
              className={`${field} resize-none`}
              id={descriptionId}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={event => setDescription(event.target.value)}
              placeholder="A sleepy fox whose tail is a candle flame"
              rows={2}
              value={description}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button disabled={!canSubmit} type="submit">
              {create.isPending ? 'Drawing…' : 'Create'}
            </Button>
            <p className="text-caption text-ink-muted">
              Drawn by Google&apos;s Gemini. Up to 5 an hour; nothing is saved,
              so download the ones you like.
            </p>
          </div>
          {create.isError && (
            <p className="text-body-lg font-bold text-danger" role="alert">
              {create.error.message}
            </p>
          )}
        </DialogBox>
      </form>

      <section aria-label="Your creations">
        <ul
          aria-busy={create.isPending}
          className="grid grid-cols-1 items-start gap-5 xs:grid-cols-2 lg:grid-cols-3"
        >
          {create.isPending && (
            <li
              aria-label="Drawing your creature"
              className="flex flex-col gap-3 rounded-box frame-box bg-box p-3.5"
            >
              <span className="block aspect-square animate-pulse-soft rounded-inset bg-inset" />
              <span className="block h-6 w-2/3 animate-pulse-soft rounded-tag bg-inset" />
            </li>
          )}
          {creations.map(creature => (
            <CreationCard creature={creature} key={creature.id} />
          ))}
        </ul>
      </section>
    </main>
  )
}
