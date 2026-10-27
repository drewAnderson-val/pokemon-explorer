from typing import Any

import psycopg
import pytest

from app.db.migrate import migrate


async def user(conn: psycopg.AsyncConnection, name: str = "Drew") -> Any:
    cursor = await conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (%s, 'x') RETURNING id", (name,)
    )
    row = await cursor.fetchone()
    assert row
    return row[0]


async def add(
    conn: psycopg.AsyncConnection, user_id: Any, uid: str, slot: int, pokemon: int
) -> None:
    await conn.execute(
        "INSERT INTO team_members (user_id, uid, slot, pokemon_id, level, xp)"
        " VALUES (%s, %s, %s, %s, 5, 125)",
        (user_id, uid, slot, pokemon),
    )


async def test_a_seventh_slot_is_rejected(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    u = await user(conn)
    with pytest.raises(psycopg.errors.CheckViolation):
        await add(conn, u, "a", 6, 1)


async def test_the_same_creature_twice_is_rejected(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    u = await user(conn)
    await add(conn, u, "a", 0, 1)
    with pytest.raises(psycopg.errors.UniqueViolation):
        await add(conn, u, "b", 1, 1)


async def test_slots_can_be_swapped_in_one_transaction(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    u = await user(conn)
    await add(conn, u, "a", 0, 1)
    await add(conn, u, "b", 1, 2)
    async with conn.transaction():
        await conn.execute("UPDATE team_members SET slot = 1 WHERE uid = 'a'")
        await conn.execute("UPDATE team_members SET slot = 0 WHERE uid = 'b'")
    cursor = await conn.execute("SELECT uid FROM team_members ORDER BY slot")
    assert await cursor.fetchall() == [("b",), ("a",)]


async def test_deleting_a_user_deletes_their_team_and_battle(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    u = await user(conn)
    await add(conn, u, "a", 0, 1)
    await conn.execute("INSERT INTO wild_battles (user_id, state, turn) VALUES (%s, '{}', 0)", (u,))
    await conn.execute("DELETE FROM users WHERE id = %s", (u,))
    for table in ("team_members", "wild_battles"):
        cursor = await conn.execute(f"SELECT count(*) FROM {table}")
        assert await cursor.fetchone() == (0,)
