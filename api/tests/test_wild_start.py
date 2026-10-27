import psycopg
from fastapi.testclient import TestClient

from tests.accounts import sign_up
from tests.engine.helpers import ScriptedRng


def team(client: TestClient, headers: dict[str, str], ids: list[int]) -> None:
    members = [{"creatureId": i} for i in ids]
    assert client.put("/api/team", json={"members": members}, headers=headers).status_code == 200


def test_signed_out_is_401(client: TestClient) -> None:
    assert client.post("/api/battles/wild").status_code == 401
    assert client.get("/api/battles/wild").status_code == 401


def test_start_picks_a_wild_creature_off_the_team(client: TestClient) -> None:
    h = sign_up(client)
    team(client, h, [1, 2])
    # Catalog ids not on the team, ascending: 3, 4, …; 0.0 picks the first.
    # Team levels [5, 5] → 5, and 0.5 → offset 0.
    client.app.state.rng = ScriptedRng(0.0, 0.5)  # type: ignore[attr-defined]
    response = client.post("/api/battles/wild", headers=h)
    assert response.status_code == 201
    body = response.json()
    assert body["turn"] == 0
    enemy = body["state"]["enemy"]
    assert (enemy["creature"]["id"], enemy["level"]) == (3, 5)
    assert enemy["uid"].startswith("wild-")
    assert [f["creature"]["id"] for f in body["state"]["party"]] == [1, 2]
    assert client.get("/api/battles/wild", headers=h).json() == body


def test_the_enemy_is_never_on_the_team(client: TestClient) -> None:
    h = sign_up(client)
    team(client, h, [999, 1000])
    client.app.state.rng = ScriptedRng(0.9999, 0.5)  # type: ignore[attr-defined]
    enemy = client.post("/api/battles/wild", headers=h).json()["state"]["enemy"]
    assert enemy["creature"]["id"] == 998


def test_starting_again_replaces_the_battle(client: TestClient) -> None:
    h = sign_up(client)
    team(client, h, [1])
    client.app.state.rng = ScriptedRng(0.0, 0.5, 0.5, 0.5)  # type: ignore[attr-defined]
    first = client.post("/api/battles/wild", headers=h).json()
    second = client.post("/api/battles/wild", headers=h).json()
    assert first["state"]["enemy"]["creature"]["id"] != second["state"]["enemy"]["creature"]["id"]
    assert client.get("/api/battles/wild", headers=h).json() == second


def test_no_battle_after_running_away(client: TestClient) -> None:
    h = sign_up(client)
    team(client, h, [1])
    client.post("/api/battles/wild", headers=h)
    assert client.delete("/api/battles/wild", headers=h).status_code == 204
    response = client.get("/api/battles/wild", headers=h)
    assert response.status_code == 404
    assert response.json() == {"error": "No battle in progress"}


def test_an_empty_team_cannot_battle(client: TestClient) -> None:
    response = client.post("/api/battles/wild", headers=sign_up(client))
    assert response.status_code == 409
    assert response.json() == {"error": "Add a creature to your team first"}


def test_a_fainted_team_needs_a_rest(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    team(client, h, [1, 2])
    with psycopg.connect(test_database_url) as conn:
        conn.execute("UPDATE team_members SET hp = 0")
    response = client.post("/api/battles/wild", headers=h)
    assert response.status_code == 409
    assert response.json() == {"error": "Your team needs a rest"}


def test_another_user_cannot_see_the_battle(client: TestClient) -> None:
    a, b = sign_up(client, "alice"), sign_up(client, "bob")
    team(client, a, [1])
    client.post("/api/battles/wild", headers=a)
    assert client.get("/api/battles/wild", headers=b).status_code == 404
