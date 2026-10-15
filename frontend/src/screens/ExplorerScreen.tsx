import { useCallback, useMemo, useRef, useState } from 'react'

import { CreatureCard, CreatureCardSkeleton } from '@/components/CreatureCard'
import { DialogBox } from '@/components/DialogBox'
import { SearchField } from '@/components/SearchField'
import { SortMenu } from '@/components/SortMenu'
import { StatusBox, type StatusKind } from '@/components/StatusBox'
import { TypeFilterChip } from '@/components/TypeFilterChip'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useLoadMoreSentinel } from '@/hooks/useLoadMoreSentinel'
import { useCatalogTotal, usePokemonPages } from '@/hooks/usePokemonPages'
import { useSlashToFocus } from '@/hooks/useSlashToFocus'
import { POKEMON_TYPES, type PokemonType, type SortKey } from '@/lib/pokemon'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 250
const FIRST_PAGE_SKELETONS = 10
const MORE_SKELETONS = 4

export function ExplorerScreen() {
  const [searchInput, setSearchInput] = useState('')
  const [type, setType] = useState<null | PokemonType>(null)
  const [sort, setSort] = useState<SortKey>('id')
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(
    () => new Set()
  )

  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  useSlashToFocus(searchRef)

  const trimmedSearch = searchInput.trim()
  const debouncedSearch = useDebouncedValue(trimmedSearch, SEARCH_DEBOUNCE_MS)
  // Clearing (Escape, Clear filters) applies at once; only typing is debounced.
  // Otherwise "Clear filters" briefly queries the old search without its type.
  const search = trimmedSearch === '' ? '' : debouncedSearch
  const catalogTotal = useCatalogTotal()
  const query = usePokemonPages({ search, sort, type })
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage, isPending } =
    query

  const pokemon = useMemo(
    () => query.data?.pages.flatMap(page => page.data) ?? [],
    [query.data]
  )
  const total = query.data?.pages[0]?.pagination.total
  const filtering = search !== '' || type !== null

  const sentinelRef = useLoadMoreSentinel({
    enabled: hasNextPage && !isFetchingNextPage && !isError,
    onLoadMore: () => void fetchNextPage(),
    pageCount: query.data?.pages.length ?? 0
  })

  const toggle = useCallback((id: number) => {
    setExpandedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // The status box's button unmounts after these actions, so move focus
  // somewhere sensible instead of letting it drop to <body>.
  const clearFilters = () => {
    setSearchInput('')
    setType(null)
    searchRef.current?.focus()
  }

  // A failed next page keeps the loaded cards; retry just that page. Focus the
  // last loaded card so the next Tab lands on the new ones.
  const retry = () => {
    if (!query.data) {
      searchRef.current?.focus()
      void query.refetch()
      return
    }
    const cards = gridRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[aria-expanded]'
    )
    cards?.[cards.length - 1]?.focus()
    void fetchNextPage()
  }

  let status: null | StatusKind = null
  if (isError) status = 'error'
  else if (isPending) status = null
  else if (pokemon.length === 0) status = 'empty'
  else if (isFetchingNextPage) status = 'loading'
  else if (!hasNextPage) status = 'end'

  const skeletons = isPending
    ? FIRST_PAGE_SKELETONS
    : isFetchingNextPage
      ? MORE_SKELETONS
      : 0

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 pt-6 pb-16 xs:px-6 lg:px-14 lg:pt-12">
      <header className="flex flex-col gap-6 md:flex-row">
        <DialogBox className="shrink-0">
          <h1 className="text-heading font-bold uppercase">Explorer</h1>
          <p className="mt-1 text-caption text-ink-muted">
            {catalogTotal.data ?? '…'} creatures on file
          </p>
        </DialogBox>
        <SearchField
          onChange={setSearchInput}
          ref={searchRef}
          value={searchInput}
        />
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <fieldset className="min-w-0" id="types">
          <legend className="sr-only">Filter by type</legend>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 xs:mx-0 xs:flex-wrap xs:overflow-visible xs:px-0">
            <TypeFilterChip
              onPress={() => setType(null)}
              pressed={type === null}
              type={null}
            />
            {POKEMON_TYPES.map(option => (
              <TypeFilterChip
                key={option}
                onPress={() => setType(option)}
                pressed={type === option}
                type={option}
              />
            ))}
          </div>
        </fieldset>
        <SortMenu onChange={setSort} value={sort} />
      </div>

      <p
        aria-live="polite"
        className={cn('text-body text-ink-muted', !filtering && 'sr-only')}
      >
        {filtering && total !== undefined
          ? `${total} ${total === 1 ? 'result' : 'results'}`
          : ''}
      </p>

      <ul
        aria-label="Creatures"
        className="grid grid-flow-dense grid-cols-1 items-start gap-5 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
        ref={gridRef}
      >
        {pokemon.map(p => (
          <CreatureCard
            expanded={expandedIds.has(p.id)}
            key={p.id}
            onToggle={toggle}
            pokemon={p}
          />
        ))}
        {Array.from({ length: skeletons }, (_, index) => (
          // Placeholders have no identity; their position is their key.

          <CreatureCardSkeleton key={index} />
        ))}
      </ul>

      <div aria-hidden ref={sentinelRef} />
      {status && (
        <StatusBox
          kind={status}
          onAction={
            status === 'error'
              ? retry
              : status === 'empty'
                ? clearFilters
                : undefined
          }
        />
      )}
    </main>
  )
}
