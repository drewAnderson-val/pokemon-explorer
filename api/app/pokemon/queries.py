"""SQL for the pokemon catalog. Every value is a query parameter; the only text
built from the request is ORDER BY, and that comes from a fixed dict."""

import math
from typing import Any

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
WHERE = """
    (%(type)s::text IS NULL OR %(type)s = ANY(types))
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
    params = {
        "type": query.type,
        "pattern": like_pattern(query.search),
        "limit": query.limit,
        "offset": (query.page - 1) * query.limit,
    }
    cursor = await conn.execute(f"SELECT count(*) FROM pokemon WHERE {WHERE}", params)
    (total,) = await cursor.fetchone() or (0,)

    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE {WHERE}"
        f" ORDER BY {ORDER_BY[query.sort]} LIMIT %(limit)s OFFSET %(offset)s",
        params,
    )
    data = [to_json(row) for row in await cursor.fetchall()]

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


async def find_by_id(conn: AsyncConnection, pokemon_id: int) -> dict[str, Any] | None:
    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE id = %s",
        (pokemon_id,),
    )
    row = await cursor.fetchone()
    return to_json(row) if row else None


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
