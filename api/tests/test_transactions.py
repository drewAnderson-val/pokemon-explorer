"""A route's `async with conn.transaction()` must be a real transaction that commits
before the response is sent, not a savepoint inside one the pool commits later."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from psycopg import AsyncConnection
from psycopg.pq import TransactionStatus

from app.auth.deps import CurrentUser
from app.config import Settings
from app.db.pool import get_conn
from app.main import create_app
from tests.accounts import sign_up
from tests.conftest import TEST_JWT_SECRET


@pytest.fixture
def probe_client(test_database_url: str, reset_db: None) -> Iterator[TestClient]:
    from typing import Annotated

    from fastapi import Depends

    app = create_app(Settings(test_database_url, TEST_JWT_SECRET))

    @app.get("/test/tx")
    async def tx(
        user: CurrentUser, conn: Annotated[AsyncConnection, Depends(get_conn)]
    ) -> dict[str, str]:
        # current_user has already run a query on this connection.
        return {"status": conn.info.transaction_status.name}

    with TestClient(app) as client:
        yield client


def test_no_transaction_is_left_open_before_the_route_runs(probe_client: TestClient) -> None:
    h = sign_up(probe_client)
    assert probe_client.get("/test/tx", headers=h).json() == {"status": TransactionStatus.IDLE.name}
