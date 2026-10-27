import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth.passwords import DUMMY_HASH, verify_password

CREDS = {"username": "Drew_1", "password": "correct horse"}


def signup(client: TestClient, **overrides: str) -> Any:
    return client.post("/api/auth/signup", json={**CREDS, **overrides})


def login(client: TestClient, **overrides: str) -> Any:
    return client.post("/api/auth/login", json={**CREDS, **overrides})


def test_signup_then_me(client: TestClient) -> None:
    response = signup(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["username"] == "Drew_1"
    assert body["expiresAt"] - time.time() == pytest.approx(3600, abs=5)
    me = client.get("/api/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json() == body["user"]


def test_me_without_a_token_is_401(client: TestClient) -> None:
    assert client.get("/api/me").status_code == 401


def test_signup_rejects_taken_username_ignoring_case(client: TestClient) -> None:
    signup(client)
    response = signup(client, username="drew_1")
    assert response.status_code == 409
    assert response.json() == {"error": "That username is taken"}


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("username", "ab", "username must be 3-20 letters, digits or underscores"),
        ("username", "a" * 21, "username must be 3-20 letters, digits or underscores"),
        ("username", "has space", "username must be 3-20 letters, digits or underscores"),
        ("username", "émile", "username must be 3-20 letters, digits or underscores"),
        ("password", "short", "password must be 8-128 characters"),
        ("password", "x" * 129, "password must be 8-128 characters"),
    ],
)
def test_signup_validates(client: TestClient, field: str, value: str, message: str) -> None:
    response = signup(client, **{field: value})
    assert response.status_code == 400
    assert response.json() == {"error": message}


def test_login_succeeds_ignoring_username_case(client: TestClient) -> None:
    signup(client)
    response = login(client, username="drew_1")
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "Drew_1"


def test_wrong_password_and_unknown_user_get_the_same_answer(client: TestClient) -> None:
    signup(client)
    wrong = login(client, password="wrong horse")
    unknown = login(client, username="nobody_here")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"error": "Wrong username or password"}


def test_unknown_user_still_runs_a_verify(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    checked: list[str] = []

    def spy(password_hash: str, password: str) -> bool:
        checked.append(password_hash)
        return verify_password(password_hash, password)

    monkeypatch.setattr("app.routes.auth.verify_password", spy)
    login(client, username="nobody_here")
    assert checked == [DUMMY_HASH]


def test_missing_fields_are_400(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 400
    assert "error" in response.json()


def test_password_is_never_returned_or_stored(client: TestClient, test_database_url: str) -> None:
    response = signup(client)
    assert "correct horse" not in response.text
    with psycopg.connect(test_database_url) as conn:
        row = conn.execute("SELECT password_hash FROM users").fetchone()
    assert row and "correct horse" not in row[0]


def test_logins_do_not_block_each_other(client: TestClient) -> None:
    signup(client)
    login(client)  # warm up
    started = time.monotonic()
    login(client)
    one = time.monotonic() - started

    started = time.monotonic()
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda _: login(client), range(4)))
    four = time.monotonic() - started

    assert all(r.status_code == 200 for r in results)
    # Hashing on the event loop would run them one after another (about 4x).
    assert four < one * 2.5
