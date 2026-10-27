import os
from collections.abc import AsyncIterator, Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict

from app.config import Settings
from app.main import create_app

TEST_JWT_SECRET = "test-secret-at-least-32-bytes-long"
DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:54329/postgres"


def assert_local(url: str) -> None:
    # reset_db wipes the whole schema, so never let it near a real database.
    # Parsed the way libpq reads it: ?host= and ?hostaddr= override the URL's host.
    params = conninfo_to_dict(url)
    host = params.get("host")
    hostaddr = params.get("hostaddr") or os.environ.get("PGHOSTADDR")
    if host not in ("localhost", "127.0.0.1") or hostaddr not in (None, "127.0.0.1", "::1"):
        raise RuntimeError(f"Tests only run against localhost, not {hostaddr or host}")


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    assert_local(url)
    return url


@pytest.fixture
def reset_db(test_database_url: str) -> None:
    with psycopg.connect(test_database_url, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")


@pytest.fixture
def client(test_database_url: str, reset_db: None) -> Iterator[TestClient]:
    app = create_app(Settings(test_database_url, TEST_JWT_SECRET))
    # Used as a context manager so the app's startup and shutdown (the lifespan) run.
    with TestClient(app) as client:
        yield client


@pytest.fixture
async def conn(test_database_url: str, reset_db: None) -> AsyncIterator[psycopg.AsyncConnection]:
    async with await psycopg.AsyncConnection.connect(test_database_url, autocommit=True) as conn:
        yield conn
