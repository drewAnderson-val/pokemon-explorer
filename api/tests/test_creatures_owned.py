"""Custom creatures are rows in pokemon with an owner: visible and usable only by
that owner, and never a wild enemy."""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg
from fastapi.testclient import TestClient

from tests.accounts import sign_up
from tests.engine.helpers import ScriptedRng


def custom(url: str, username: str, name: str = "Embercub") -> int:
    """A custom creature owned by `username`, as the lab will store it."""
    with psycopg.connect(url) as conn:
        row = conn.execute(
            "INSERT INTO pokemon (id, owner_id, name, types, height, weight, hp, attack,"
            " defense, special_attack, special_defense, speed, description, image_url,"
            " generation, is_legendary)"
            " SELECT nextval('pokemon_custom_id_seq'), id, %s, ARRAY['Fire'], 1.2, 30.5,"
            " 80, 90, 70, 60, 50, 40, 'A test creature.', 'https://img.test/a.png', 10, false"
            " FROM users WHERE username = %s RETURNING id",
            (name, username),
        ).fetchone()
    assert row
    return int(row[0])


def sql(url: str, query: str, *args: Any) -> None:
    with psycopg.connect(url) as conn:
        conn.execute(query, args)


def put_team(client: TestClient, h: dict[str, str], ids: list[int]) -> Any:
    return client.put("/api/team", json={"members": [{"creatureId": i} for i in ids]}, headers=h)


def test_custom_ids_start_at_1001_and_are_not_reused(
    client: TestClient, test_database_url: str
) -> None:
    sign_up(client, "maker")
    first, second = custom(test_database_url, "maker"), custom(test_database_url, "maker")
    sql(test_database_url, "DELETE FROM pokemon WHERE id = %s", second)
    assert (first, second, custom(test_database_url, "maker")) == (1001, 1002, 1003)


def test_deleting_a_creature_takes_it_off_teams(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client, "maker")
    mine = custom(test_database_url, "maker")
    assert put_team(client, h, [1, mine]).status_code == 200
    sql(test_database_url, "DELETE FROM pokemon WHERE id = %s", mine)
    assert [m["creatureId"] for m in client.get("/api/team", headers=h).json()["members"]] == [1]


def test_your_creature_by_id(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client, "maker")
    mine = custom(test_database_url, "maker")
    response = client.get(f"/api/pokemon/{mine}", headers=h)
    assert response.status_code == 200
    assert response.json()["name"] == "Embercub"


def test_someone_elses_creature_is_404(client: TestClient, test_database_url: str) -> None:
    sign_up(client, "maker")
    stranger = sign_up(client, "stranger")
    theirs = custom(test_database_url, "maker")
    for headers in (stranger, {}):
        response = client.get(f"/api/pokemon/{theirs}", headers=headers)
        assert response.status_code == 404
        assert response.json() == {"error": f"No creature #{theirs}"}


def test_the_catalog_list_leaves_custom_creatures_out(
    client: TestClient, test_database_url: str
) -> None:
    h = sign_up(client, "maker")
    custom(test_database_url, "maker", name="Zzzcustom")
    assert client.get("/api/pokemon", headers=h).json()["pagination"]["total"] == 1000
    assert client.get("/api/pokemon?search=zzzcustom", headers=h).json()["data"] == []


def test_a_team_cant_use_someone_elses_creature(client: TestClient, test_database_url: str) -> None:
    sign_up(client, "maker")
    stranger = sign_up(client, "stranger")
    theirs = custom(test_database_url, "maker")
    response = put_team(client, stranger, [theirs])
    assert response.status_code == 400
    assert response.json() == {"error": f"No creature #{theirs}"}


def test_a_team_can_use_your_own_creature(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client, "maker")
    mine = custom(test_database_url, "maker")
    assert put_team(client, h, [mine]).status_code == 200


def lock_in(client: TestClient, h: dict[str, str], match_id: str, ids: list[int]) -> Any:
    return client.post(
        f"/api/matches/{match_id}/actions",
        json={"action": {"type": "team", "creatureIds": ids}},
        headers=h,
    )


def test_a_match_team_cant_use_someone_elses_creature(
    client: TestClient, test_database_url: str
) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    hosts = custom(test_database_url, "host")
    # The host's creature, locked into this match, still isn't the guest's to use.
    assert lock_in(client, host, match_id, [hosts]).status_code == 204
    response = lock_in(client, guest, match_id, [hosts])
    assert response.status_code == 400


def test_your_creature_fights_in_a_match_and_the_friend_sees_it(
    client: TestClient, test_database_url: str
) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    hosts = custom(test_database_url, "host")
    assert lock_in(client, host, match_id, [hosts]).status_code == 204
    assert lock_in(client, guest, match_id, [2]).status_code == 204
    view = client.get(f"/api/matches/{match_id}", headers=guest).json()
    assert view["battle"]["enemy"]["creature"]["name"] == "Embercub"


def test_the_wild_enemy_is_never_a_custom_creature(
    client: TestClient, test_database_url: str
) -> None:
    h = sign_up(client, "maker")
    custom(test_database_url, "maker")
    assert put_team(client, h, [1]).status_code == 200
    # The last id on the list: 1000 from the catalog, not the custom 1001.
    client.app.state.rng = ScriptedRng(0.9999, 0.5)  # type: ignore[attr-defined]
    enemy = client.post("/api/battles/wild", headers=h).json()["state"]["enemy"]
    assert enemy["creature"]["id"] == 1000


def test_a_lock_in_waits_for_a_delete_of_that_creature(
    client: TestClient, test_database_url: str
) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    hosts = custom(test_database_url, "host")
    # A delete of the creature is under way (not yet committed) when the lock-in
    # arrives. The lock-in must wait for it and then refuse the gone creature, not
    # lock in a team that points at a deleted row.
    with psycopg.connect(test_database_url) as deleting:
        deleting.execute("DELETE FROM pokemon WHERE id = %s", (hosts,))
        with ThreadPoolExecutor(1) as pool:
            locking = pool.submit(lock_in, client, host, match_id, [hosts])
            time.sleep(0.5)
            deleting.commit()
            assert locking.result(timeout=5).status_code == 400
    view = client.get(f"/api/matches/{match_id}", headers=host).json()
    assert view["ready"] is False
