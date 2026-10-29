from typing import Any

import psycopg
from fastapi.testclient import TestClient

from tests.accounts import sign_up


def create(client: TestClient, h: dict[str, str]) -> str:
    response = client.post("/api/matches", headers=h)
    assert response.status_code == 201, response.text
    match_id: str = response.json()["matchId"]
    return match_id


def view(client: TestClient, h: dict[str, str], match_id: str) -> Any:
    response = client.get(f"/api/matches/{match_id}", headers=h)
    assert response.status_code == 200, response.text
    return response.json()


def test_signed_out_is_401(client: TestClient) -> None:
    assert client.post("/api/matches").status_code == 401
    assert client.post("/api/matches/abcdefgh/join").status_code == 401


def test_create_then_a_friend_joins(client: TestClient) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = create(client, host)
    assert len(match_id) == 8
    waiting = view(client, host, match_id)
    assert (waiting["phase"], waiting["you"], waiting["opponent"]["joined"]) == (
        "waiting",
        "host",
        False,
    )

    joined = client.post(f"/api/matches/{match_id}/join", headers=guest)
    assert joined.json() == {"seat": "guest"}
    picking = view(client, host, match_id)
    assert (picking["phase"], picking["opponent"]["joined"]) == ("picking", True)
    assert view(client, guest, match_id)["you"] == "guest"


def test_joining_again_is_harmless(client: TestClient) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = create(client, host)
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    assert client.post(f"/api/matches/{match_id}/join", headers=guest).json() == {"seat": "guest"}
    assert client.post(f"/api/matches/{match_id}/join", headers=host).json() == {"seat": "host"}


def test_a_third_player_is_turned_away(client: TestClient) -> None:
    host, guest, third = sign_up(client, "host"), sign_up(client, "guest"), sign_up(client, "third")
    match_id = create(client, host)
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    response = client.post(f"/api/matches/{match_id}/join", headers=third)
    assert response.status_code == 409
    assert response.json() == {"error": "The match is full"}
    # And they can't look at it either.
    assert client.get(f"/api/matches/{match_id}", headers=third).status_code == 404


def test_unknown_match_is_404(client: TestClient) -> None:
    h = sign_up(client)
    response = client.post("/api/matches/abcdefgh/join", headers=h)
    assert response.status_code == 404
    assert response.json() == {"error": "No such match"}


def test_twenty_new_matches_an_hour(client: TestClient) -> None:
    h = sign_up(client)
    for _ in range(20):
        create(client, h)
    response = client.post("/api/matches", headers=h)
    assert response.status_code == 429
    assert response.json() == {"error": "You've started a lot of matches! Try again later."}


def test_at_most_500_open_matches(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    match_id = create(client, h)
    # 499 more open matches (any valid, distinct ids), for 500 in all.
    ids = [f"{a}{b}{c}aaaaa" for a in "cdefg" for b in "hjkmnpqrst" for c in "uvwxyz23456789"]
    ids = [i for i in ids if i != match_id][:499]
    with psycopg.connect(test_database_url) as conn:
        host_id = conn.execute("SELECT host_id FROM matches").fetchone()
        assert host_id
        with conn.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO matches (id, host_id) VALUES (%s, %s)", [(i, host_id[0]) for i in ids]
            )
    response = client.post("/api/matches", headers=sign_up(client, "other"))
    assert response.status_code == 503
    assert response.json() == {"error": "Too many open matches. Try again soon."}
