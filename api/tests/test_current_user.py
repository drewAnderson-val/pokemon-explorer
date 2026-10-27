from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth.deps import CurrentUser
from app.auth.tokens import issue_token
from app.config import Settings
from app.main import create_app

SECRET = "test-secret-at-least-32-bytes-long"


@pytest.fixture
def app_client(test_database_url: str, reset_db: None) -> Iterator[TestClient]:
    app = create_app(Settings(test_database_url, SECRET))

    @app.get("/test/whoami")
    async def whoami(user: CurrentUser) -> dict[str, str]:
        return {"username": user.username}

    with TestClient(app) as client:
        yield client


@pytest.fixture
def user_id(app_client: TestClient, test_database_url: str) -> UUID:
    with psycopg.connect(test_database_url) as conn:
        row = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES ('Drew', 'x') RETURNING id"
        ).fetchone()
    assert row
    return UUID(str(row[0]))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_valid_token_gives_the_user(app_client: TestClient, user_id: UUID) -> None:
    token, _ = issue_token(user_id, SECRET)
    response = app_client.get("/test/whoami", headers=bearer(token))
    assert response.status_code == 200
    assert response.json() == {"username": "Drew"}


def test_scheme_is_case_insensitive(app_client: TestClient, user_id: UUID) -> None:
    token, _ = issue_token(user_id, SECRET)
    response = app_client.get("/test/whoami", headers={"Authorization": f"bearer {token}"})
    assert response.status_code == 200


def test_no_header_is_401(app_client: TestClient) -> None:
    response = app_client.get("/test/whoami")
    assert response.status_code == 401
    assert response.json() == {"error": "Sign in to continue"}
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "Bearer  two-spaces", "token"])
def test_malformed_header_is_401(app_client: TestClient, header: str) -> None:
    response = app_client.get("/test/whoami", headers={"Authorization": header})
    assert response.status_code == 401


def test_expired_token_is_401(app_client: TestClient, user_id: UUID) -> None:
    old = datetime.now(UTC) - timedelta(hours=2)
    token, _ = issue_token(user_id, SECRET, now=old)
    assert app_client.get("/test/whoami", headers=bearer(token)).status_code == 401


def test_token_for_a_deleted_user_is_401(
    app_client: TestClient, user_id: UUID, test_database_url: str
) -> None:
    token, _ = issue_token(user_id, SECRET)
    with psycopg.connect(test_database_url) as conn:
        conn.execute("DELETE FROM users")
    assert app_client.get("/test/whoami", headers=bearer(token)).status_code == 401


def test_token_signed_with_another_secret_is_401(app_client: TestClient, user_id: UUID) -> None:
    token, _ = issue_token(user_id, "someone-elses-secret-also-32-bytes")
    assert app_client.get("/test/whoami", headers=bearer(token)).status_code == 401
