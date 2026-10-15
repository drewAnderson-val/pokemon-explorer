import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'

import { CreationCard } from '@/components/CreationCard'
import { DialogBox } from '@/components/DialogBox'
import { TypeFilterChip } from '@/components/TypeFilterChip'
import { Button } from '@/components/ui/button'
import { useCreations } from '@/hooks/useCreations'
import { createCreature } from '@/lib/api'
import {
  MAX_CREATURE_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH
} from '@/lib/creature'
import { POKEMON_TYPES, type PokemonType } from '@/lib/pokemon'

const field =
  'w-full min-w-0 border-b-2 border-ink bg-transparent py-1 text-body-lg outline-none placeholder:text-ink-muted focus-visible:focus-ring'

export function CreatorScreen() {
  const nameId = useId()
  const descriptionId = useId()
  const [name, setName] = useState('')
  const [types, setTypes] = useState<PokemonType[]>([])
  const [description, setDescription] = useState('')
  const { add, creations, remove } = useCreations()

  const create = useMutation({
    mutationFn: createCreature,
    onSuccess: ({ creature }) => add(creature)
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
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pt-6 pb-16 xs:px-6 lg:px-14 lg:pt-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <DialogBox className="sm:p-3.5">
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

      {/* Desktop: the form stays put on the left and cards fill the right, so
          a new card appears next to the form without scrolling. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start">
        <form className="lg:sticky lg:top-6" onSubmit={submit}>
          <DialogBox className="flex flex-col gap-4">
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
              <div className="mt-2 grid grid-cols-2 gap-2 xs:grid-cols-3">
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

            <Button disabled={!canSubmit} type="submit">
              {create.isPending ? 'Drawing…' : 'Create'}
            </Button>
            {create.isError && (
              <p className="text-body-lg font-bold text-danger" role="alert">
                {create.error.message}
              </p>
            )}
          </DialogBox>
        </form>

        <section aria-labelledby="custom-cards" className="flex flex-col gap-4">
          <h2 className="text-heading font-bold uppercase" id="custom-cards">
            Custom cards
            <span className="ml-2 align-middle text-caption font-normal text-ink-muted normal-case">
              Saved in this browser
            </span>
          </h2>
          {creations.length === 0 && !create.isPending && (
            <DialogBox className="text-center">
              <p className="text-body-lg">
                Your cards will appear here. Give your creature a name and a
                type to draw the first one!
              </p>
            </DialogBox>
          )}
          <ul
            aria-busy={create.isPending}
            className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-1"
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
              <CreationCard
                creature={creature}
                key={creature.id}
                onDelete={id => void remove(id)}
              />
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
