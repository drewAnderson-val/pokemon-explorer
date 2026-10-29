from typing import Any

import psycopg
import pytest

from app.db.migrate import migrate


async def user(conn: psycopg.AsyncConnection, name: str) -> Any:
    cursor = await conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (%s, 'x') RETURNING id", (name,)
    )
    row = await cursor.fetchone()
    assert row
    return row[0]


@pytest.mark.parametrize("bad_id", ["short", "toolongid", "abcdefg1", "ABCDEFGH", "abcdefgi"])
async def test_a_match_id_uses_the_unambiguous_alphabet(
    conn: psycopg.AsyncConnection, bad_id: str
) -> None:
    await migrate(conn)
    host = await user(conn, "host")
    with pytest.raises(psycopg.errors.CheckViolation):
        await conn.execute("INSERT INTO matches (id, host_id) VALUES (%s, %s)", (bad_id, host))


async def test_a_host_cannot_be_their_own_guest(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    host = await user(conn, "host")
    with pytest.raises(psycopg.errors.CheckViolation):
        await conn.execute(
            "INSERT INTO matches (id, host_id, guest_id) VALUES ('abcdefgh', %s, %s)", (host, host)
        )


async def test_deleting_a_match_deletes_its_actions(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    host = await user(conn, "host")
    await conn.execute("INSERT INTO matches (id, host_id) VALUES ('abcdefgh', %s)", (host,))
    await conn.execute(
        "INSERT INTO match_actions (match_id, user_id, idempotency_key, request_hash, status)"
        " VALUES ('abcdefgh', %s, 'k', 'h', 204)",
        (host,),
    )
    await conn.execute("DELETE FROM matches")
    cursor = await conn.execute("SELECT count(*) FROM match_actions")
    assert await cursor.fetchone() == (0,)
