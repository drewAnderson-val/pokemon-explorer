import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import type { PokemonPage } from '@/lib/pokemon'

import {
  fetchCatalogSummary,
  fetchPokemonPage,
  type PokemonFilters
} from '@/lib/api'

// Totals for the landing page: count, generations and creatures per type.
export function useCatalogSummary() {
  return useQuery({
    queryFn: ({ signal }) => fetchCatalogSummary(signal),
    queryKey: ['pokemon', 'summary'],
    staleTime: Infinity
  })
}

export function useCatalogTotal() {
  return useQuery({
    queryFn: ({ signal }) =>
      fetchPokemonPage({
        limit: 1,
        page: 1,
        search: '',
        signal,
        sort: 'id',
        type: null
      }),
    queryKey: ['pokemon', 'catalog-total'],
    select: page => page.pagination.total,
    staleTime: Infinity
  })
}

// Keyed by the filters: a new search is a new query starting at page 1, and
// the old one is aborted (TanStack cancels unobserved queries that read `signal`).
export function usePokemonPages(filters: PokemonFilters) {
  return useInfiniteQuery({
    getNextPageParam: (last: PokemonPage) =>
      last.pagination.hasNext ? last.pagination.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      fetchPokemonPage({ ...filters, page: pageParam, signal }),
    queryKey: ['pokemon', 'pages', filters]
  })
}
