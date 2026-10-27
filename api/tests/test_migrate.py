import asyncio
from pathlib import Path
from typing import Any

import psycopg
import pytest

from app.db.migrate import migrate


def write(directory: Path, name: str, sql: str) -> None:
    (directory / name).write_text(sql)


async def rows(conn: psycopg.AsyncConnection, sql: str) -> list[tuple[Any, ...]]:
    cursor = await conn.execute(sql)
    return await cursor.fetchall()


async def test_applies_in_order_and_records(tmp_path: Path, conn: psycopg.AsyncConnection) -> None:
    write(tmp_path, "0002_b.sql", "INSERT INTO t VALUES (2);")
    write(tmp_path, "0001_a.sql", "CREATE TABLE t (n int);")

    assert await migrate(conn, tmp_path) == ["0001_a.sql", "0002_b.sql"]
    assert await rows(conn, "SELECT n FROM t") == [(2,)]
    assert await rows(conn, "SELECT name FROM schema_migrations ORDER BY name") == [
        ("0001_a.sql",),
        ("0002_b.sql",),
    ]


async def test_second_run_applies_nothing(tmp_path: Path, conn: psycopg.AsyncConnection) -> None:
    write(tmp_path, "0001_a.sql", "CREATE TABLE t (n int);")
    await migrate(conn, tmp_path)

    assert await migrate(conn, tmp_path) == []


async def test_ignores_files_that_are_not_numbered_sql(
    tmp_path: Path, conn: psycopg.AsyncConnection
) -> None:
    write(tmp_path, "0001_a.sql", "CREATE TABLE t (n int);")
    write(tmp_path, "README.md", "not sql")
    write(tmp_path, "draft.sql", "SELECT broken")

    assert await migrate(conn, tmp_path) == ["0001_a.sql"]


async def test_failed_migration_leaves_nothing(
    tmp_path: Path, conn: psycopg.AsyncConnection
) -> None:
    write(tmp_path, "0001_bad.sql", "CREATE TABLE t (n int); SELECT * FROM missing;")

    with pytest.raises(psycopg.errors.UndefinedTable):
        await migrate(conn, tmp_path)
    assert await rows(conn, "SELECT to_regclass('t')") == [(None,)]
    assert await rows(conn, "SELECT name FROM schema_migrations") == []


async def test_requires_an_autocommit_connection(
    tmp_path: Path, test_database_url: str, reset_db: None
) -> None:
    async with await psycopg.AsyncConnection.connect(test_database_url) as conn:
        with pytest.raises(ValueError, match="autocommit"):
            await migrate(conn, tmp_path)


async def test_concurrent_runners_apply_once(
    tmp_path: Path, test_database_url: str, reset_db: None
) -> None:
    write(
        tmp_path,
        "0001_a.sql",
        "CREATE TABLE t (n int); SELECT pg_sleep(0.5); INSERT INTO t VALUES (1);",
    )

    async def run() -> list[str]:
        async with await psycopg.AsyncConnection.connect(
            test_database_url, autocommit=True
        ) as conn:
            return await migrate(conn, tmp_path)

    first, second = await asyncio.gather(run(), run())

    assert sorted([first, second]) == [[], ["0001_a.sql"]]
