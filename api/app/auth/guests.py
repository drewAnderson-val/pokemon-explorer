"""Guest accounts: one click, no password, gone a day later.

A guest is an ordinary user row with is_guest set, so every route, limit and
ownership check works unchanged. The name is random and the password is a random
secret nobody is told, so nobody can sign in as a guest: when the token expires
(an hour), the guest is over.
"""

import secrets
import string

import psycopg
from psycopg import AsyncConnection
from starlette.concurrency import run_in_threadpool

from app.auth.passwords import hash_password
from app.auth.users import User, UsernameTaken

PREFIX = "guest_"
# Each guest is a row, a team and maybe battles: a cap so a script can't fill the
# database. Accounts are still open past it.
GUESTS_PER_HOUR = 300
KEEP_FOR = "1 day"
ALPHABET = string.ascii_lowercase + string.digits


async def create_guest(conn: AsyncConnection) -> User | None:
    """The new guest, or None when the hourly cap is reached."""
    cursor = await conn.execute(
        "SELECT count(*) FROM users WHERE is_guest AND created_at > now() - interval '1 hour'"
    )
    (recent,) = await cursor.fetchone() or (0,)
    if recent >= GUESTS_PER_HOUR:
        return None
    password_hash = await run_in_threadpool(hash_password, secrets.token_urlsafe(32))
    while True:
        name = PREFIX + "".join(secrets.choice(ALPHABET) for _ in range(8))
        try:
            return await insert_guest(conn, name, password_hash)
        except UsernameTaken:
            continue  # 36^8 names: a clash is vanishingly rare, so just pick again


async def insert_guest(conn: AsyncConnection, name: str, password_hash: str) -> User:
    try:
        cursor = await conn.execute(
            "INSERT INTO users (username, password_hash, is_guest) VALUES (%s, %s, true)"
            " RETURNING id, username",
            (name, password_hash),
        )
    except psycopg.errors.UniqueViolation as error:
        raise UsernameTaken from error
    row = await cursor.fetchone()
    assert row is not None
    return User(*row)


async def delete_expired_guests(conn: AsyncConnection) -> int:
    """Deletes guests older than KEEP_FOR; their teams, battles, matches and
    creatures go with them (ON DELETE CASCADE). Returns how many."""
    cursor = await conn.execute(
        f"DELETE FROM users WHERE is_guest AND created_at < now() - interval '{KEEP_FOR}'"
    )
    return cursor.rowcount
