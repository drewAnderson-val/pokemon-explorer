from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

CORS_REGEX = r"^https://pokemon-explorer(-pr-\d+)?-ogxllptvoa-uc\.a\.run\.app$"


@pytest.fixture
def cors_client(test_database_url: str, reset_db: None) -> Iterator[TestClient]:
    settings = Settings(test_database_url, "unused", cors_origin_regex=CORS_REGEX)
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.mark.parametrize(
    "origin",
    [
        "https://pokemon-explorer-ogxllptvoa-uc.a.run.app",
        "https://pokemon-explorer-pr-24-ogxllptvoa-uc.a.run.app",
    ],
)
def test_allowed_origin_gets_header(cors_client: TestClient, origin: str) -> None:
    response = cors_client.get("/api/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.com",
        "https://pokemon-explorer-ogxllptvoa-uc.a.run.app.evil.com",
        "http://pokemon-explorer-ogxllptvoa-uc.a.run.app",
    ],
)
def test_other_origins_get_no_header(cors_client: TestClient, origin: str) -> None:
    response = cors_client.get("/api/health", headers={"Origin": origin})
    assert "access-control-allow-origin" not in response.headers


def test_cors_env_var_is_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    monkeypatch.setenv("CORS_ORIGIN_REGEX", CORS_REGEX)
    assert Settings.from_env().cors_origin_regex == CORS_REGEX
