import psycopg

from app.db.migrate import migrate


async def test_every_public_table_has_rls(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)

    cursor = await conn.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity"
    )
    assert await cursor.fetchall() == []
