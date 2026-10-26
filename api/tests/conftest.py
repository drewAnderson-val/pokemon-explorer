import os
from collections.abc import AsyncIterator, Iterator
from urllib.parse import urlparse

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:54329/postgres"


def assert_local(url: str) -> None:
    # reset_db wipes the whole schema, so never let it near a real database.
    host = urlparse(url).hostname
    if host not in ("localhost", "127.0.0.1"):
        raise RuntimeError(f"Tests only run against localhost, not {host}")


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
    app = create_app(Settings(test_database_url, "test-secret", run_migrations=False))
    # Used as a context manager so the app's startup and shutdown (the lifespan) run.
    with TestClient(app) as client:
        yield client


@pytest.fixture
async def conn(test_database_url: str, reset_db: None) -> AsyncIterator[psycopg.AsyncConnection]:
    async with await psycopg.AsyncConnection.connect(test_database_url, autocommit=True) as conn:
        yield conn
