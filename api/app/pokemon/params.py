"""Turns the query string of GET /api/pokemon into a PokemonQuery.

A port of parsePokemonQuery in server/query.ts, with the same defaults, limits
and error messages, so the frontend can't tell the two APIs apart.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass

POKEMON_TYPES = (
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground",
    "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
)  # fmt: skip
SORT_KEYS = ("id", "total", "speed")
PAGE_SIZE = 20
MAX_LIMIT = 100
MAX_SEARCH_LENGTH = 100

# [0-9], not \d: Python's \d also matches non-ASCII digits like "٣".
DIGITS = re.compile(r"[0-9]+")


@dataclass(frozen=True)
class PokemonQuery:
    limit: int
    page: int
    search: str
    sort: str
    type: str | None


def parse_pokemon_query(params: Mapping[str, list[str]]) -> PokemonQuery | str:
    """Returns the query, or an error message for a 400."""
    page = _positive_int(params.get("page"), 1)
    if page is None:
        return "page must be a positive integer"

    limit = _positive_int(params.get("limit"), PAGE_SIZE)
    if limit is None or limit > MAX_LIMIT:
        return f"limit must be an integer from 1 to {MAX_LIMIT}"

    searches = params.get("search", [""])
    if len(searches) != 1:
        return "search must be a single string"
    if len(searches[0]) > MAX_SEARCH_LENGTH:
        return f"search must be at most {MAX_SEARCH_LENGTH} characters"
    search = searches[0].strip()

    sorts = params.get("sort", ["id"])
    if len(sorts) != 1 or sorts[0] not in SORT_KEYS:
        return f"sort must be one of {', '.join(SORT_KEYS)}"

    type_: str | None = None
    types = params.get("type", [""])
    if types != [""]:
        wanted = types[0].lower() if len(types) == 1 else ""
        canonical = wanted[:1].upper() + wanted[1:]
        if canonical not in POKEMON_TYPES:
            return "type must be a known type"
        type_ = canonical

    return PokemonQuery(limit=limit, page=page, search=search, sort=sorts[0], type=type_)


def _positive_int(values: list[str] | None, fallback: int) -> int | None:
    """The fallback when absent or empty; None when present but not a positive integer."""
    if values is None or values == [""]:
        return fallback
    if len(values) != 1 or not DIGITS.fullmatch(values[0]):
        return None
    value = int(values[0])
    return value if value >= 1 else None
