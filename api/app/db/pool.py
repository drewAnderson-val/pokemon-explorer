from collections.abc import AsyncIterator

from fastapi import Request
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool


def open_pool(database_url: str) -> AsyncConnectionPool:
    # Created closed; the app's lifespan opens it without waiting, so a slow or
    # down database doesn't stop the server from starting and answering /api/health.
    return AsyncConnectionPool(
        database_url,
        min_size=1,
        max_size=10,
        open=False,
        check=AsyncConnectionPool.check_connection,
    )


async def get_conn(request: Request) -> AsyncIterator[AsyncConnection]:
    pool: AsyncConnectionPool = request.app.state.pool
    async with pool.connection() as conn:
        yield conn
