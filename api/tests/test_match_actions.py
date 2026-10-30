from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.accounts import sign_up


def act(
    client: TestClient,
    h: dict[str, str],
    match_id: str,
    action: dict[str, Any],
    key: str | None = None,
) -> Any:
    headers = {**h, "Idempotency-Key": key} if key else h
    return client.post(f"/api/matches/{match_id}/actions", json={"action": action}, headers=headers)


def view(client: TestClient, h: dict[str, str], match_id: str) -> Any:
    return client.get(f"/api/matches/{match_id}", headers=h).json()


def battle(client: TestClient) -> tuple[str, dict[str, str], dict[str, str]]:
    """A match with both teams locked in: the battle is running."""
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    assert act(client, host, match_id, {"type": "team", "creatureIds": [1, 2]}).status_code == 204
    assert act(client, guest, match_id, {"type": "team", "creatureIds": [3, 4]}).status_code == 204
    return match_id, host, guest


def move(index: int = 0) -> dict[str, Any]:
    return {"type": "move", "index": index, "timing": 1}


def test_both_teams_start_the_battle(client: TestClient) -> None:
    match_id, host, guest = battle(client)
    for h in (host, guest):
        seen = view(client, h, match_id)
        assert (seen["phase"], seen["turn"]) == ("battle", 1)
        assert seen["battle"] is not None


def test_the_opponents_team_is_secret_until_the_battle(client: TestClient) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    act(client, host, match_id, {"type": "team", "creatureIds": [1, 2]})
    seen = view(client, guest, match_id)
    assert seen["opponent"]["ready"] is True
    assert seen["battle"] is None


def test_a_turn_resolves_when_both_have_moved(client: TestClient) -> None:
    match_id, host, guest = battle(client)
    assert act(client, host, match_id, move(), key="h1").status_code == 204
    assert view(client, guest, match_id)["opponent"]["acted"] is True
    assert act(client, guest, match_id, move(), key="g1").status_code == 204
    seen = view(client, host, match_id)
    assert seen["turn"] == 2
    assert [e["type"] for e in seen["events"]].count("move") == 2
    assert (seen["acted"], seen["opponent"]["acted"]) == (False, False)


def test_simultaneous_moves_resolve_each_turn_exactly_once(client: TestClient) -> None:
    match_id, host, guest = battle(client)
    # Every attack misses, so nobody faints and the match lasts all 20 rounds: a
    # 0.999 roll misses any move under 100% accuracy, and move 1 always is one.
    client.app.state.rng = lambda: 0.999  # type: ignore[attr-defined]

    def move_as(who: tuple[str, dict[str, str]], round_: int) -> int:
        status: int = act(client, who[1], match_id, move(1), key=f"{who[0]}{round_}").status_code
        return status

    with ThreadPoolExecutor(2) as pool:
        for round_ in range(20):
            turn_before = view(client, host, match_id)["turn"]
            codes = list(pool.map(move_as, [("h", host), ("g", guest)], [round_, round_]))
            assert codes == [204, 204], f"round {round_}"
            seen = view(client, host, match_id)
            assert seen["turn"] == turn_before + 1, f"round {round_}"
            assert (seen["acted"], seen["opponent"]["acted"]) == (False, False)
            assert [e["type"] for e in seen["events"]].count("move") == 2


def test_a_retried_move_applies_once(client: TestClient) -> None:
    match_id, host, guest = battle(client)
    assert act(client, host, match_id, move(), key="same").status_code == 204
    # The answer was lost; the client sends it again with the same key.
    assert act(client, host, match_id, move(), key="same").status_code == 204
    assert act(client, guest, match_id, move(), key="g").status_code == 204
    assert view(client, host, match_id)["turn"] == 2


def test_a_key_reused_for_a_different_action_is_refused(client: TestClient) -> None:
    match_id, host, _ = battle(client)
    act(client, host, match_id, move(0), key="k")
    response = act(client, host, match_id, move(1), key="k")
    assert response.status_code == 409
    assert response.json() == {"error": "That key was used for a different action"}


def test_moves_need_an_idempotency_key(client: TestClient) -> None:
    match_id, host, _ = battle(client)
    response = act(client, host, match_id, move())
    assert response.status_code == 400
    assert response.json() == {"error": "Send an Idempotency-Key header with each move"}


@pytest.mark.parametrize(
    ("action", "status", "message"),
    [
        ({"type": "team", "creatureIds": [1]}, 409, "The battle has started"),
        ({"type": "fly"}, 400, "Unknown action"),
        ({"type": "move", "index": 9, "timing": 1}, 400, "No such move"),
        ({"type": "switch", "to": 0}, 400, "Can't switch to that creature"),
        ({"type": "sendOut", "to": 1}, 409, "Nothing to send out"),
    ],
)
def test_refusals_match_the_express_api(
    client: TestClient, action: dict[str, Any], status: int, message: str
) -> None:
    match_id, host, _ = battle(client)
    response = act(client, host, match_id, action, key="k")
    assert response.status_code == status
    assert response.json() == {"error": message}


def test_moving_twice_in_a_turn_is_409(client: TestClient) -> None:
    match_id, host, _ = battle(client)
    act(client, host, match_id, move(), key="a")
    response = act(client, host, match_id, move(), key="b")
    assert response.status_code == 409
    assert response.json() == {"error": "You already acted this turn"}


def test_a_move_before_the_battle_is_409(client: TestClient) -> None:
    host = sign_up(client, "host")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    response = act(client, host, match_id, move(), key="k")
    assert response.status_code == 409
    assert response.json() == {"error": "The battle is not running"}


@pytest.mark.parametrize("ids", [[], [1, 2, 3, 4, 5, 6, 7], [5000], ["1"], "1,2"], ids=str)
def test_a_team_is_1_to_6_known_creatures(client: TestClient, ids: Any) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    response = act(client, host, match_id, {"type": "team", "creatureIds": ids})
    assert response.status_code == 400
    assert response.json() == {"error": "A team is 1 to 6 known creature ids"}


def test_forfeit(client: TestClient) -> None:
    match_id, host, guest = battle(client)
    assert act(client, host, match_id, {"type": "forfeit"}).status_code == 204
    assert view(client, guest, match_id)["outcome"] == {"reason": "forfeit", "winner": "you"}
    response = act(client, host, match_id, move(), key="k")
    assert response.status_code == 409


def test_a_stranger_cannot_act(client: TestClient) -> None:
    match_id, _, _ = battle(client)
    response = act(client, sign_up(client, "stranger"), match_id, move(), key="k")
    assert response.status_code == 404


def test_timing_is_clamped(client: TestClient, test_database_url: str) -> None:
    def host_hit(timing: float) -> int:
        match_id, host, guest = battle_named(client, f"t{str(timing).replace('.', '_')}")
        client.app.state.rng = lambda: 0.0  # type: ignore[attr-defined]
        act(client, host, match_id, {"type": "move", "index": 0, "timing": timing}, key="h")
        act(client, guest, match_id, move(), key="g")
        events = view(client, host, match_id)["events"]
        amount: int = next(
            e["amount"] for e in events if e["type"] == "damage" and e["target"] == "enemy"
        )
        return amount

    assert host_hit(100) == host_hit(1.25)


def battle_named(client: TestClient, suffix: str) -> tuple[str, dict[str, str], dict[str, str]]:
    host, guest = sign_up(client, f"host{suffix}"), sign_up(client, f"guest{suffix}")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    act(client, host, match_id, {"type": "team", "creatureIds": [1, 2]})
    act(client, guest, match_id, {"type": "team", "creatureIds": [3, 4]})
    return match_id, host, guest


def test_a_big_body_is_refused(client: TestClient) -> None:
    match_id, host, _ = battle(client)
    response = client.post(
        f"/api/matches/{match_id}/actions",
        content='{"action": {"type": "forfeit", "pad": "' + "x" * 3000 + '"}}',
        headers={**host, "content-type": "application/json"},
    )
    assert response.status_code == 413


def test_a_retried_team_lock_in_with_its_key_is_answered_as_before(client: TestClient) -> None:
    # The browser resends a lock-in whose response was lost, with the same key.
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    team = {"type": "team", "creatureIds": [1, 2]}
    assert act(client, host, match_id, team, key="lock").status_code == 204
    assert act(client, host, match_id, team, key="lock").status_code == 204
    # Without the key the same resend is refused: the team is already locked in.
    assert act(client, host, match_id, team).status_code != 204
