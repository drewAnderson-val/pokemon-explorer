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
        # Autocommit: a lone query commits on its own, and a route's
        # `async with conn.transaction()` is a real BEGIN/COMMIT that finishes before
        # the route returns. Without it the connection is already inside a
        # transaction by the time the route runs (current_user has queried it), the
        # route's block is only a savepoint, and the real COMMIT happens when the pool
        # takes the connection back, after the response is sent: a client could read
        # stale data, or be told 200 for a write whose commit then failed.
        kwargs={"autocommit": True},
        open=False,
        check=AsyncConnectionPool.check_connection,
    )


async def get_conn(request: Request) -> AsyncIterator[AsyncConnection]:
    pool: AsyncConnectionPool = request.app.state.pool
    async with pool.connection() as conn:
        yield conn
