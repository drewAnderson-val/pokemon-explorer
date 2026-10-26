"""Applies the numbered .sql files in migrations/ that haven't run yet.

Runs on every API startup. Two instances can start at once, so the whole run
holds a Postgres advisory lock: the second waits, then finds nothing to do.
"""

import asyncio
import re
from pathlib import Path

from psycopg import AsyncConnection, sql

from app.config import Settings

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
# Any fixed number works; every runner just has to agree on it.
MIGRATION_LOCK_ID = 7_301_026
MIGRATION_FILE = re.compile(r"^\d{4}_\w+\.sql$")


async def migrate(conn: AsyncConnection, directory: Path = MIGRATIONS_DIR) -> list[str]:
    # Each file commits on its own. Without autocommit, everything would sit in one
    # open transaction and the lock could be released before the work is visible.
    if not conn.autocommit:
        raise ValueError("migrate needs an autocommit connection")

    await conn.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name text PRIMARY KEY,"
            " applied_at timestamptz NOT NULL DEFAULT now())"
        )
        cursor = await conn.execute("SELECT name FROM schema_migrations")
        done = {name for (name,) in await cursor.fetchall()}

        applied = []
        for path in sorted(directory.iterdir()):
            if not MIGRATION_FILE.match(path.name) or path.name in done:
                continue
            # The file and its record commit together, or not at all.
            async with conn.transaction():
                await conn.execute(sql.SQL(path.read_text()))
                await conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
        return applied
    finally:
        await conn.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))


async def _main() -> None:
    settings = Settings.from_env()
    async with await AsyncConnection.connect(settings.database_url, autocommit=True) as conn:
        for name in await migrate(conn):
            print(name)


if __name__ == "__main__":
    asyncio.run(_main())
