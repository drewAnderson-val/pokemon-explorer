from concurrent.futures import ThreadPoolExecutor
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.engine.wild import resolve_turn
from tests.accounts import sign_up
from tests.engine.helpers import ScriptedRng

HIT = [0.1, 0.0, 0.9, 0.5, 0.0, 0.9, 0.5]  # enemy picks best; then hit, no crit, roll ×2


def start(client: TestClient, h: dict[str, str], ids: list[int], rng: list[float]) -> Any:
    members = [{"creatureId": i} for i in ids]
    client.put("/api/team", json={"members": members}, headers=h)
    client.app.state.rng = ScriptedRng(*rng)  # type: ignore[attr-defined]
    return client.post("/api/battles/wild", headers=h).json()


def act(
    client: TestClient, h: dict[str, str], turn: int, action: dict[str, Any], rng: list[float]
) -> Any:
    client.app.state.rng = ScriptedRng(*rng)  # type: ignore[attr-defined]
    return client.post(
        "/api/battles/wild/actions", json={"turn": turn, "action": action}, headers=h
    )


def set_enemy_hp(url: str, hp: int) -> None:
    with psycopg.connect(url) as conn:
        conn.execute(
            "UPDATE wild_battles SET state = jsonb_set(state, '{enemy,hp}', %s::jsonb)", (str(hp),)
        )


def test_a_move_matches_the_engine(client: TestClient) -> None:
    h = sign_up(client)
    battle = start(client, h, [1], [0.0, 0.5])
    expected = resolve_turn(battle["state"], {"index": 0, "type": "move"}, ScriptedRng(*HIT))
    response = act(client, h, 0, {"index": 0, "type": "move"}, HIT)
    assert response.status_code == 200
    assert response.json() == {"events": expected["events"], "state": expected["state"], "turn": 1}
    assert client.get("/api/battles/wild", headers=h).json()["turn"] == 1


def test_a_win_saves_xp_and_hp_to_the_team(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    start(client, h, [1], [0.0, 0.5])
    set_enemy_hp(test_database_url, 1)
    body = act(client, h, 0, {"index": 0, "type": "move"}, HIT).json()
    assert body["state"]["winner"] == "player"
    member = client.get("/api/team", headers=h).json()["members"][0]
    fighter = body["state"]["party"][0]
    assert member["xp"] == fighter["xp"] > 125
    assert member["level"] == fighter["level"]


def test_a_catch_joins_the_team_once(client: TestClient) -> None:
    h = sign_up(client)
    battle = start(client, h, [1], [0.0, 0.5])
    body = act(client, h, 0, {"type": "catch"}, [0, 0, 0, 0]).json()
    assert body["state"]["caught"] is True
    ids = [m["creatureId"] for m in client.get("/api/team", headers=h).json()["members"]]
    assert ids == [1, battle["state"]["enemy"]["creature"]["id"]]


def test_no_catch_joins_a_full_team(client: TestClient) -> None:
    h = sign_up(client)
    start(client, h, [1, 2, 3, 4, 5], [0.0, 0.5])
    client.put("/api/team", json={"members": client.get("/api/team", headers=h).json()["members"]
                                  + [{"creatureId": 900}]}, headers=h)  # fmt: skip
    # The battle started with 5; the team now has 6, so a catch has no room.
    act(client, h, 0, {"type": "catch"}, [0, 0, 0, 0])
    assert len(client.get("/api/team", headers=h).json()["members"]) == 6


def test_timing_is_capped(client: TestClient) -> None:
    def player_hit(timing: float) -> int:
        h = sign_up(client, f"t{str(timing).replace('.', '_')}")
        start(client, h, [1], [0.0, 0.5])
        events = act(client, h, 0, {"index": 0, "timing": timing, "type": "move"}, HIT).json()[
            "events"
        ]
        return next(e["amount"] for e in events if e["type"] == "damage" and e["target"] == "enemy")

    assert player_hit(100) == player_hit(1.25)


def test_a_repeated_turn_applies_once(client: TestClient) -> None:
    h = sign_up(client)
    start(client, h, [1], [0.0, 0.5])
    client.app.state.rng = ScriptedRng(*HIT * 2)  # type: ignore[attr-defined]
    body = {"turn": 0, "action": {"index": 0, "type": "move"}}
    with ThreadPoolExecutor(2) as pool:
        codes = sorted(
            pool.map(
                lambda _: (
                    client.post("/api/battles/wild/actions", json=body, headers=h).status_code
                ),
                range(2),
            )
        )
    assert codes == [200, 409]
    assert client.get("/api/battles/wild", headers=h).json()["turn"] == 1


def test_a_stale_turn_is_409(client: TestClient) -> None:
    h = sign_up(client)
    start(client, h, [1], [0.0, 0.5])
    act(client, h, 0, {"index": 0, "type": "move"}, HIT)
    response = act(client, h, 0, {"index": 0, "type": "move"}, HIT)
    assert response.status_code == 409
    assert response.json() == {"error": "That turn is over"}


def test_acting_after_the_end_is_409(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    start(client, h, [1], [0.0, 0.5])
    set_enemy_hp(test_database_url, 1)
    act(client, h, 0, {"index": 0, "type": "move"}, HIT)
    response = act(client, h, 1, {"index": 0, "type": "move"}, HIT)
    assert response.status_code == 409
    assert response.json() == {"error": "The battle is over"}


def test_a_removed_member_is_not_brought_back(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    start(client, h, [1, 2], [0.0, 0.5])
    first = client.get("/api/team", headers=h).json()["members"][0]
    client.put("/api/team", json={"members": [first]}, headers=h)
    set_enemy_hp(test_database_url, 1)
    act(client, h, 0, {"index": 0, "type": "move"}, HIT)
    assert [m["creatureId"] for m in client.get("/api/team", headers=h).json()["members"]] == [1]


@pytest.mark.parametrize(
    "action",
    [{"index": -1, "type": "move"}, {"index": 9, "type": "move"}, {"type": "run"}, {}],
)
def test_bad_actions_are_400(client: TestClient, action: dict[str, Any]) -> None:
    h = sign_up(client)
    start(client, h, [1], [0.0, 0.5])
    response = act(client, h, 0, action, HIT)
    assert response.status_code == 400
    assert "error" in response.json()


def test_no_battle_is_404_and_another_user_cannot_act(client: TestClient) -> None:
    a, b = sign_up(client, "alice"), sign_up(client, "bob")
    start(client, a, [1], [0.0, 0.5])
    response = act(client, b, 0, {"index": 0, "type": "move"}, HIT)
    assert response.status_code == 404
    assert client.get("/api/battles/wild", headers=a).json()["turn"] == 0


def test_send_out_after_a_faint(client: TestClient, test_database_url: str) -> None:
    h = sign_up(client)
    start(client, h, [1, 2], [0.0, 0.5])
    with psycopg.connect(test_database_url) as conn:
        conn.execute("UPDATE wild_battles SET state = jsonb_set(state, '{party,0,hp}', '1')")
    # The lead has 1 HP and every scripted hit lands, so the enemy's hit faints it.
    body = act(client, h, 0, {"index": 0, "type": "move"}, HIT).json()
    assert body["state"]["mustSwitch"] is True
    response = act(client, h, 1, {"index": 0, "type": "move"}, HIT)
    assert response.status_code == 409
    assert response.json() == {"error": "Send out another creature first"}
    sent = act(client, h, 1, {"to": 1, "type": "sendOut"}, [])
    assert sent.status_code == 200
    assert sent.json()["state"]["active"] == 1
