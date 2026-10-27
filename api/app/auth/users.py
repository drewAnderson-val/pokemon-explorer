from dataclasses import dataclass
from uuid import UUID

import psycopg
from psycopg import AsyncConnection


@dataclass(frozen=True)
class User:
    id: UUID
    username: str


class UsernameTaken(Exception):
    pass


async def create_user(conn: AsyncConnection, username: str, password_hash: str) -> User:
    try:
        cursor = await conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id, username",
            (username, password_hash),
        )
    except psycopg.errors.UniqueViolation as error:
        # The unique index on lower(username) decides, not a check beforehand:
        # two signups racing for the same name can't both pass.
        raise UsernameTaken from error
    row = await cursor.fetchone()
    assert row is not None
    return User(*row)


async def find_login(conn: AsyncConnection, username: str) -> tuple[User, str] | None:
    """The user and their password hash, matching the username ignoring case."""
    cursor = await conn.execute(
        "SELECT id, username, password_hash FROM users WHERE lower(username) = lower(%s)",
        (username,),
    )
    row = await cursor.fetchone()
    return (User(row[0], row[1]), row[2]) if row else None


async def find_user(conn: AsyncConnection, user_id: UUID) -> User | None:
    cursor = await conn.execute("SELECT id, username FROM users WHERE id = %s", (user_id,))
    row = await cursor.fetchone()
    return User(*row) if row else None
