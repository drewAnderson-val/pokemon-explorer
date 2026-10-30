import json
from pathlib import Path
from typing import Any

import psycopg

from app.db.migrate import MIGRATIONS_DIR, migrate
from scripts.copy_catalog_images import catalog_sources, catalog_url
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


async def test_migrations_load_every_record_unchanged(conn: psycopg.AsyncConnection) -> None:
    # The seed plus 0007 (catalog images in the bucket) is exactly pokemon.json.
    await migrate(conn)

    rows = await all_as_json_shape(conn)

    assert len(rows) == 1000
    assert rows == json.loads(POKEMON_JSON.read_text())


async def test_total_stats_is_the_sum_of_six_stats(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)

    cursor = await conn.execute("SELECT total_stats FROM pokemon WHERE id = 1")

    assert await cursor.fetchone() == (28 + 128 + 162 + 193 + 140 + 132,)


def test_seed_file_matches_the_json_with_its_original_images() -> None:
    # 0002 is applied and frozen: it keeps the original placeholder image URLs,
    # which 0007 replaced (and copy_catalog_images reads them from here).
    seed = SEED_FILE.read_text()
    originals = catalog_sources(seed)
    records = json.loads(POKEMON_JSON.read_text())
    for item in records:
        item["imageUrl"] = originals[item["id"]]
    assert render(records) == seed


def test_render_escapes_quotes() -> None:
    sql = render([record(name="Farfetch'd")])

    assert "'Farfetch''d'" in sql


async def test_catalog_images_are_in_the_bucket(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    owner = await conn.execute(
        "INSERT INTO users (username, password_hash) VALUES ('maker', 'x') RETURNING id"
    )
    (owner_id,) = await owner.fetchone() or ()
    await conn.execute(
        "INSERT INTO pokemon (id, owner_id, name, types, height, weight, hp, attack, defense,"
        " special_attack, special_defense, speed, description, image_url, generation)"
        " VALUES (1001, %s, 'Mine', ARRAY['Fire'], 1, 1, 1, 1, 1, 1, 1, 1, '',"
        " 'https://img.test/mine.png', 10)",
        (owner_id,),
    )

    cursor = await conn.execute("SELECT id, image_url FROM pokemon ORDER BY id")
    rows: dict[int, str] = dict(await cursor.fetchall())

    assert all(rows[i] == catalog_url(i) for i in range(1, 1001))
    assert rows[1001] == "https://img.test/mine.png"
