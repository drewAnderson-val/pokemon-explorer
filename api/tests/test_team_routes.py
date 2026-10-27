from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.accounts import sign_up


def put(client: TestClient, headers: dict[str, str], members: list[dict[str, Any]]) -> Any:
    return client.put("/api/team", json={"members": members}, headers=headers)


def test_signed_out_is_401(client: TestClient) -> None:
    assert client.get("/api/team").status_code == 401
    assert client.put("/api/team", json={"members": []}).status_code == 401
    assert client.post("/api/team/rest").status_code == 401


def test_a_new_account_has_an_empty_team(client: TestClient) -> None:
    response = client.get("/api/team", headers=sign_up(client))
    assert response.json() == {"members": [], "creatures": {}}


def test_add_reorder_and_remove(client: TestClient) -> None:
    h = sign_up(client)
    body = put(client, h, [{"creatureId": 1}, {"creatureId": 2}]).json()
    first, second = body["members"]
    assert [m["creatureId"] for m in body["members"]] == [1, 2]
    assert first == {"creatureId": 1, "hp": None, "level": 5, "uid": first["uid"], "xp": 125}
    assert set(body["creatures"]) == {"1", "2"}
    assert body["creatures"]["1"]["name"]

    reordered = put(client, h, [second, first]).json()["members"]
    assert [m["uid"] for m in reordered] == [second["uid"], first["uid"]]

    left = put(client, h, [first]).json()["members"]
    assert [m["uid"] for m in left] == [first["uid"]]
    assert client.get("/api/team", headers=h).json()["members"] == left


def test_the_client_cannot_set_stats(client: TestClient) -> None:
    h = sign_up(client)
    member = put(client, h, [{"creatureId": 1}]).json()["members"][0]
    cheat = {**member, "level": 100, "xp": 10**9, "hp": 9999}
    kept = put(client, h, [cheat, {"creatureId": 2, "level": 100, "xp": 10**9}]).json()
    assert kept["members"][0] == member
    assert (kept["members"][1]["level"], kept["members"][1]["xp"]) == (5, 125)


def test_unknown_uid_is_a_new_member(client: TestClient) -> None:
    h = sign_up(client)
    member = put(client, h, [{"uid": "made-up", "creatureId": 3}]).json()["members"][0]
    assert member["uid"] != "made-up"


@pytest.mark.parametrize(
    ("members", "message"),
    [
        ([{"creatureId": i} for i in range(1, 8)], "A team is 0 to 6 creatures"),
        ([{"creatureId": 1}, {"creatureId": 1}], "Each creature can only be on the team once"),
        ([{"creatureId": 5000}], "No creature #5000"),
        ([{"creatureId": "1"}], None),
        ([{}], None),
    ],
)
def test_bad_teams_are_400(client: TestClient, members: list[Any], message: str | None) -> None:
    response = put(client, sign_up(client), members)
    assert response.status_code == 400
    if message:
        assert response.json() == {"error": message}


def test_rest_restores_hp(client: TestClient, test_database_url: str) -> None:
    import psycopg

    h = sign_up(client)
    put(client, h, [{"creatureId": 1}])
    with psycopg.connect(test_database_url) as conn:
        conn.execute("UPDATE team_members SET hp = 3")
    assert client.get("/api/team", headers=h).json()["members"][0]["hp"] == 3
    assert client.post("/api/team/rest", headers=h).json()["members"][0]["hp"] is None


def test_teams_are_per_user(client: TestClient) -> None:
    a, b = sign_up(client, "alice"), sign_up(client, "bob")
    put(client, a, [{"creatureId": 1}])
    assert client.get("/api/team", headers=b).json()["members"] == []


def test_a_uid_cannot_carry_stats_to_another_creature(
    client: TestClient, test_database_url: str
) -> None:
    import psycopg

    h = sign_up(client)
    member = put(client, h, [{"creatureId": 1}]).json()["members"][0]
    with psycopg.connect(test_database_url) as conn:
        conn.execute("UPDATE team_members SET level = 50, xp = 125000")
    swapped = put(client, h, [{"uid": member["uid"], "creatureId": 2}]).json()["members"][0]
    assert (swapped["creatureId"], swapped["level"]) == (2, 5)
