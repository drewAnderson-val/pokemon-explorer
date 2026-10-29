"""Reading and creating match rows. Callers that change a match run inside a
transaction and load it with lock=True (SELECT … FOR UPDATE) first."""

import secrets
from typing import Any
from uuid import UUID

import psycopg
from psycopg import AsyncConnection
from psycopg.rows import dict_row

ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
ID_LENGTH = 8
MAX_PER_HOUR = 20
MAX_OPEN = 500

Match = dict[str, Any]


def new_id() -> str:
    return "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))


async def load_match(conn: AsyncConnection, match_id: str, *, lock: bool = False) -> Match | None:
    cursor = conn.cursor(row_factory=dict_row)
    await cursor.execute(
        "SELECT * FROM matches WHERE id = %s" + (" FOR UPDATE" if lock else ""), (match_id,)
    )
    return await cursor.fetchone()


def seat_of(match: Match, user_id: UUID) -> str | None:
    if match["host_id"] == user_id:
        return "host"
    if match["guest_id"] == user_id:
        return "guest"
    return None


async def notify(conn: AsyncConnection, match_id: str) -> None:
    """Tells every instance this match changed. Postgres delivers it when the
    transaction commits (never for one that rolls back)."""
    await conn.execute("SELECT pg_notify('match_events', %s)", (match_id,))


async def create_match(conn: AsyncConnection, host_id: UUID) -> str | int:
    """The new match's id, or an HTTP status when a limit is reached."""
    cursor = await conn.execute(
        "SELECT count(*) FILTER (WHERE host_id = %s AND created_at > now() - interval '1 hour'),"
        " count(*) FROM matches",
        (host_id,),
    )
    row = await cursor.fetchone()
    assert row is not None
    mine_this_hour, open_matches = row
    if mine_this_hour >= MAX_PER_HOUR:
        return 429
    if open_matches >= MAX_OPEN:
        return 503
    while True:
        match_id = new_id()
        try:
            async with conn.transaction():
                # The host's seat starts "dropped": the 60 s countdown only matters
                # once a battle runs, and starts from the later of drop and start.
                await conn.execute(
                    "INSERT INTO matches (id, host_id, host_left_at) VALUES (%s, %s, now())",
                    (match_id, host_id),
                )
            return match_id
        except psycopg.errors.UniqueViolation:
            continue
