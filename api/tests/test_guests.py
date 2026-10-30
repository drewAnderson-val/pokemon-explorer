"""Play as guest: a throwaway account in one click, cleaned up a day later."""

import time
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.auth.guests import GUESTS_PER_HOUR, delete_expired_guests


def guest(client: TestClient) -> Any:
    return client.post("/api/auth/guest")


def sql(url: str, query: str, *args: Any) -> list[Any]:
    with psycopg.connect(url, autocommit=True) as conn:
        cursor = conn.execute(query, args)
        return cursor.fetchall() if cursor.description else []


def test_a_guest_gets_a_session_that_works_everywhere(client: TestClient) -> None:
    response = guest(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["username"].startswith("guest_")
    assert body["expiresAt"] - time.time() == pytest.approx(3600, abs=5)
    h = {"Authorization": f"Bearer {body['token']}"}
    assert client.get("/api/me", headers=h).json() == body["user"]
    assert (
        client.put("/api/team", json={"members": [{"creatureId": 1}]}, headers=h).status_code == 200
    )


def test_each_guest_is_a_new_account(client: TestClient) -> None:
    first, second = guest(client).json(), guest(client).json()
    assert first["user"]["id"] != second["user"]["id"]


def test_nobody_can_sign_in_as_a_guest(client: TestClient) -> None:
    name = guest(client).json()["user"]["username"]
    for password in ("", "password", name):
        response = client.post("/api/auth/login", json={"username": name, "password": password})
        assert response.status_code in (400, 401)


def test_signup_cant_take_a_guest_name(client: TestClient) -> None:
    for username in ("guest_abc", "GUEST_abc"):
        response = client.post(
            "/api/auth/signup", json={"username": username, "password": "correct horse"}
        )
        assert (response.status_code, response.json()) == (
            400,
            {"error": "Names starting with guest_ are for guests"},
        )


def test_guests_are_capped_per_hour(client: TestClient, test_database_url: str) -> None:
    sql(
        test_database_url,
        "INSERT INTO users (username, password_hash, is_guest)"
        " SELECT 'guest_seed' || n, 'x', true FROM generate_series(1, %s) n",
        GUESTS_PER_HOUR,
    )
    response = guest(client)
    assert (response.status_code, response.json()) == (
        429,
        {"error": "Lots of guests right now. Try again soon, or create an account."},
    )


async def test_guests_older_than_a_day_are_deleted_with_their_data(
    client: TestClient, test_database_url: str
) -> None:
    old, new = guest(client).json(), guest(client).json()
    h = {"Authorization": f"Bearer {old['token']}"}
    client.put("/api/team", json={"members": [{"creatureId": 1}]}, headers=h)
    client.post("/api/auth/signup", json={"username": "Keeper", "password": "correct horse"})
    sql(
        test_database_url,
        "UPDATE users SET created_at = now() - interval '25 hours'"
        " WHERE id = %s OR username = 'Keeper'",
        old["user"]["id"],
    )
    async with await psycopg.AsyncConnection.connect(test_database_url, autocommit=True) as conn:
        assert await delete_expired_guests(conn) == 1
    users = {row[0] for row in sql(test_database_url, "SELECT username FROM users")}
    assert users == {new["user"]["username"], "Keeper"}
    assert sql(test_database_url, "SELECT count(*) FROM team_members") == [(0,)]
