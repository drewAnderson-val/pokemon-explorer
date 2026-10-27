import json
from pathlib import Path
from typing import Any

import psycopg

from app.db.migrate import MIGRATIONS_DIR, migrate
from scripts.generate_seed import render

POKEMON_JSON = Path(__file__).parents[2] / "src" / "data" / "pokemon.json"
SEED_FILE = MIGRATIONS_DIR / "0002_seed_pokemon.sql"


def record(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": 1,
        "name": "Testmon",
        "types": ["Fire"],
        "height": 1.5,
        "weight": 2.25,
        "hp": 10,
        "attack": 11,
        "defense": 12,
        "specialAttack": 13,
        "specialDefense": 14,
        "speed": 15,
        "description": "A test.",
        "imageUrl": "https://example.com/1.png",
        "generation": 1,
    }
    return {**base, **overrides}


async def all_as_json_shape(conn: psycopg.AsyncConnection) -> list[dict[str, Any]]:
    cursor = await conn.execute(
        "SELECT id, name, types, height, weight, hp, attack, defense, special_attack,"
        " special_defense, speed, description, image_url, generation, is_legendary"
        " FROM pokemon ORDER BY id"
    )
    rows = []
    for row in await cursor.fetchall():
        (id_, name, types, height, weight, hp, attack, defense, sp_atk, sp_def, speed,
         description, image_url, generation, is_legendary) = row  # fmt: skip
        item: dict[str, Any] = {
            "id": id_, "name": name, "types": types, "height": height, "weight": weight,
            "hp": hp, "attack": attack, "defense": defense, "specialAttack": sp_atk,
            "specialDefense": sp_def, "speed": speed, "description": description,
            "imageUrl": image_url, "generation": generation,
        }  # fmt: skip
        if is_legendary is not None:
            item["isLegendary"] = is_legendary
        rows.append(item)
    return rows


async def test_seed_loads_every_record_unchanged(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)

    rows = await all_as_json_shape(conn)

    assert len(rows) == 1000
    assert rows == json.loads(POKEMON_JSON.read_text())


async def test_total_stats_is_the_sum_of_six_stats(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)

    cursor = await conn.execute("SELECT total_stats FROM pokemon WHERE id = 1")

    assert await cursor.fetchone() == (28 + 128 + 162 + 193 + 140 + 132,)


def test_seed_file_is_up_to_date() -> None:
    assert render(json.loads(POKEMON_JSON.read_text())) == SEED_FILE.read_text()


def test_render_escapes_quotes() -> None:
    sql = render([record(name="Farfetch'd")])

    assert "'Farfetch''d'" in sql
