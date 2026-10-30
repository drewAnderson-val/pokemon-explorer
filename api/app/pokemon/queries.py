"""SQL for the pokemon catalog. Every value is a query parameter; the only text
built from the request is ORDER BY, and that comes from a fixed dict."""

import math
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.pokemon.params import PokemonQuery

COLUMNS = (
    "id, name, types, height, weight, hp, attack, defense, special_attack,"
    " special_defense, speed, description, image_url, generation, is_legendary"
)

# Ties break by id, so a page boundary never splits equal values differently
# between requests (no duplicates or gaps while scrolling).
ORDER_BY = {
    "id": "id",
    "total": "total_stats DESC, id",
    "speed": "speed DESC, id",
}

# Search matches name, any type or description. ILIKE isn't used because lower()
# matches the trigram indexes, which are built on lower(name) and lower(description).
# The catalog only: custom creatures (owner_id set) are listed by /api/creatures.
WHERE = """
    owner_id IS NULL
    AND (%(type)s::text IS NULL OR %(type)s = ANY(types))
    AND (
        %(pattern)s::text IS NULL
        OR lower(name) LIKE %(pattern)s
        OR lower(description) LIKE %(pattern)s
        OR EXISTS (SELECT 1 FROM unnest(types) AS t WHERE lower(t) LIKE %(pattern)s)
    )
"""


def like_pattern(search: str) -> str | None:
    """'%fire%' for a substring match, with LIKE's own wildcards made literal."""
    if not search:
        return None
    escaped = search.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def find_page(conn: AsyncConnection, query: PokemonQuery) -> dict[str, Any]:
    # Postgres text can't hold a NUL byte, so no record contains one: answer
    # without asking (sending it would be an error, not "no matches").
    if "\x00" in query.search:
        return page_body([], 0, query)

    offset = (query.page - 1) * query.limit
    params = {
        "type": query.type,
        "pattern": like_pattern(query.search),
        "limit": query.limit,
        "offset": offset,
    }
    cursor = await conn.execute(f"SELECT count(*) FROM pokemon WHERE {WHERE}", params)
    (total,) = await cursor.fetchone() or (0,)

    # Past the last match there's nothing to fetch. Also keeps a huge page number
    # from overflowing Postgres's OFFSET (a 64-bit integer).
    if offset >= total:
        return page_body([], total, query)

    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE {WHERE}"
        f" ORDER BY {ORDER_BY[query.sort]} LIMIT %(limit)s OFFSET %(offset)s",
        params,
    )
    return page_body([to_json(row) for row in await cursor.fetchall()], total, query)


def page_body(data: list[dict[str, Any]], total: int, query: PokemonQuery) -> dict[str, Any]:
    total_pages = math.ceil(total / query.limit)
    return {
        "data": data,
        "pagination": {
            "hasNext": query.page < total_pages,
            "hasPrev": query.page > 1,
            "limit": query.limit,
            "page": query.page,
            "total": total,
            "totalPages": total_pages,
        },
    }


async def find_by_id(
    conn: AsyncConnection, pokemon_id: int, viewer: UUID | None
) -> dict[str, Any] | None:
    """A catalog record, or one of the viewer's own creatures. Anyone else's is
    None (a 404), so its existence isn't confirmed."""
    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE id = %s AND (owner_id IS NULL OR owner_id = %s)",
        (pokemon_id, viewer),
    )
    row = await cursor.fetchone()
    return to_json(row) if row else None


async def find_usable(
    conn: AsyncConnection, ids: list[int], user_id: UUID
) -> dict[int, dict[str, Any]]:
    """The ids this user may put on a team: catalog records and their own creatures."""
    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE id = ANY(%s) AND (owner_id IS NULL OR owner_id = %s)",
        (ids, user_id),
    )
    return {row[0]: to_json(row) for row in await cursor.fetchall()}


async def find_many(conn: AsyncConnection, ids: list[int]) -> dict[int, dict[str, Any]]:
    """Several records by id, in one query, whoever owns them: for ids already
    checked (a saved team, the opponent's locked-in team)."""
    cursor = await conn.execute(f"SELECT {COLUMNS} FROM pokemon WHERE id = ANY(%s)", (ids,))
    return {row[0]: to_json(row) for row in await cursor.fetchall()}


def to_json(row: tuple[Any, ...]) -> dict[str, Any]:
    """A row in the API's camelCase shape; isLegendary only when the record has it."""
    (id_, name, types, height, weight, hp, attack, defense, special_attack, special_defense,
     speed, description, image_url, generation, is_legendary) = row  # fmt: skip
    item: dict[str, Any] = {
        "id": id_,
        "name": name,
        "types": types,
        "height": height,
        "weight": weight,
        "hp": hp,
        "attack": attack,
        "defense": defense,
        "specialAttack": special_attack,
        "specialDefense": special_defense,
        "speed": speed,
        "description": description,
        "imageUrl": image_url,
        "generation": generation,
    }
    if is_legendary is not None:
        item["isLegendary"] = is_legendary
    return item
