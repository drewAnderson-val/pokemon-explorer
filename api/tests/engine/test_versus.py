import copy
import math

import pytest

from app.engine.stats import stats_at
from app.engine.types import Pokemon, VersusState
from app.engine.versus import (
    battle_view_for,
    clamp_timing,
    create_versus_team,
    events_for,
    resolve_versus_turn,
    standing,
    versus_send_out,
)
from tests.engine.golden import pokemon_by_id
from tests.engine.helpers import ScriptedRng

POKEMON = pokemon_by_id()
# Ids 1 (speed 132) and 2 (178): the guest creature is faster at Lv50.
SLOW: Pokemon = POKEMON[1]
FAST: Pokemon = POKEMON[2]
THIRD: Pokemon = POKEMON[3]
HIT = (0, 0.5, 0.5)  # hit, no crit, roll


def move(index: int = 0, timing: float = 1) -> dict[str, object]:
    return {"index": index, "timing": timing, "type": "move"}


def make_state(
    host: list[Pokemon] | None = None, guest: list[Pokemon] | None = None
) -> VersusState:
    return {
        "guest": create_versus_team(guest or [FAST, THIRD], "guest"),
        "host": create_versus_team(host or [SLOW, THIRD], "host"),
        "winner": None,
    }


def never() -> float:
    raise AssertionError("rng should not be used")


def test_team_at_level_50_full_hp_active_0() -> None:
    team = create_versus_team([SLOW, FAST], "host")
    assert (team["active"], team["mustSwitch"]) == (0, False)
    assert [f["uid"] for f in team["party"]] == ["host-0", "host-1"]
    for fighter in team["party"]:
        assert fighter["level"] == 50 and fighter["hp"] == fighter["maxHp"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [(2, 1.25), (0.5, 1), ("x", 1), (math.nan, 1), (1.1, 1.1), (None, 1), (True, 1)],
)
def test_clamp_timing(value: object, expected: float) -> None:
    # True is an int in Python, but `typeof true` isn't "number" in JS: 1, not 1.25.
    assert clamp_timing(value) == expected


def test_both_move_faster_first_without_mutating_input() -> None:
    state = make_state()
    snapshot = copy.deepcopy(state)
    assert stats_at(FAST, 50)["speed"] > stats_at(SLOW, 50)["speed"]
    events = resolve_versus_turn(state, {"guest": move(), "host": move()}, ScriptedRng(*HIT, *HIT))[
        "events"
    ]
    assert [e["side"] for e in events if e["type"] == "move"] == ["enemy", "player"]
    assert len([e for e in events if e["type"] == "damage"]) == 2
    assert state == snapshot


def test_a_switch_goes_before_the_opponent_move() -> None:
    result = resolve_versus_turn(
        make_state(), {"guest": {"to": 1, "type": "switch"}, "host": move()}, ScriptedRng(*HIT)
    )
    events, nxt = result["events"], result["state"]
    assert (events[0]["side"], events[0]["type"]) == ("enemy", "switch")
    assert nxt["guest"]["active"] == 1
    damage = next(e for e in events if e["type"] == "damage")
    assert damage["target"] == "enemy"
    assert nxt["guest"]["party"][1]["hp"] < nxt["guest"]["party"][1]["maxHp"]
    assert nxt["guest"]["party"][0]["hp"] == nxt["guest"]["party"][0]["maxHp"]


def test_a_faint_stops_the_turn_and_asks_for_a_switch() -> None:
    state = make_state()
    state["guest"]["party"][0]["hp"] = 1
    result = resolve_versus_turn(state, {"guest": move(), "host": move()}, ScriptedRng(*HIT, *HIT))
    assert [e["type"] for e in result["events"]] == ["move", "damage", "move", "damage", "faint"]
    assert result["state"]["guest"]["mustSwitch"] is True
    assert result["state"]["winner"] is None


def test_a_fainted_slower_fighter_does_not_act() -> None:
    state = make_state()
    state["host"]["party"][0]["hp"] = 1
    result = resolve_versus_turn(state, {"guest": move(), "host": move()}, ScriptedRng(*HIT))
    assert len([e for e in result["events"] if e["type"] == "move"]) == 1
    assert result["state"]["host"]["mustSwitch"] is True


def test_last_faint_names_the_winner() -> None:
    state = make_state([SLOW], [FAST])
    state["host"]["party"][0]["hp"] = 1
    result = resolve_versus_turn(state, {"guest": move(), "host": move()}, ScriptedRng(*HIT))
    assert result["state"]["winner"] == "guest"
    assert result["state"]["host"]["mustSwitch"] is False
    assert not any(e["type"] == "blackout" for e in result["events"])


def test_same_state_when_a_team_must_switch_or_it_is_over() -> None:
    waiting = make_state()
    waiting["guest"]["mustSwitch"] = True
    over = make_state()
    over["winner"] = "host"
    for state in (waiting, over):
        result = resolve_versus_turn(state, {"guest": move(), "host": move()}, never)
        assert result["events"] == []
        assert result["state"] is state


def test_timing_applies_only_to_that_seat() -> None:
    def damage_for(timing: float) -> list[dict[str, object]]:
        events = resolve_versus_turn(
            make_state(), {"guest": move(0, 1), "host": move(0, timing)}, ScriptedRng(*HIT, *HIT)
        )["events"]
        return [e for e in events if e["type"] == "damage"]

    guest_low, host_low = damage_for(1)
    guest_high, host_high = damage_for(1.25)
    assert host_high["amount"] > host_low["amount"]  # type: ignore[operator]
    assert guest_high["amount"] == guest_low["amount"]


def test_send_out_rejects_fainted_or_active_targets() -> None:
    state = make_state()
    state["host"]["party"][0]["hp"] = 0
    state["host"]["party"][1]["hp"] = 0
    state["host"]["mustSwitch"] = True
    with pytest.raises(ValueError):
        versus_send_out(state, "host", 1)
    with pytest.raises(ValueError, match="Can't switch to 0"):
        versus_send_out(state, "host", 0)


def test_switch_to_the_live_active_fighter_is_rejected() -> None:
    state = make_state()
    state["host"]["mustSwitch"] = True
    with pytest.raises(ValueError, match="Can't switch to 0"):
        versus_send_out(state, "host", 0)
    with pytest.raises(ValueError, match="Can't switch to 0"):
        resolve_versus_turn(
            make_state(), {"guest": move(), "host": {"to": 0, "type": "switch"}}, never
        )


def test_send_out_clears_must_switch_and_emits_switch_from_none() -> None:
    state = make_state()
    state["host"]["party"][0]["hp"] = 0
    state["host"]["mustSwitch"] = True
    result = versus_send_out(state, "host", 1)
    assert (result["state"]["host"]["mustSwitch"], result["state"]["host"]["active"]) == (False, 1)
    event = result["events"][0]
    assert (event["from"], event["side"], event["type"]) == (None, "player", "switch")
    assert state["host"]["active"] == 0


def test_standing_counts_fighters_with_hp() -> None:
    team = create_versus_team([SLOW, FAST], "host")
    team["party"][0]["hp"] = 0
    assert standing(team) == 1


def test_events_for_swaps_sides_for_the_guest() -> None:
    events = resolve_versus_turn(
        make_state(), {"guest": move(), "host": move()}, ScriptedRng(*HIT, *HIT)
    )["events"]
    assert events_for(events, "host") is events
    flipped = events_for(events, "guest")
    assert [e["side"] for e in flipped if e["type"] == "move"] == ["player", "enemy"]
    assert [e["target"] for e in flipped if e["type"] == "damage"] == ["enemy", "player"]


def test_battle_view_for() -> None:
    state = make_state()
    view = battle_view_for(state, "guest")
    assert view["party"] is state["guest"]["party"]
    assert view["enemy"] is state["host"]["party"][0]
    assert (view["caught"], view.get("versus"), view["winner"]) == (False, True, None)
    won = {**state, "winner": "guest"}
    assert battle_view_for(won, "guest")["winner"] == "player"  # type: ignore[arg-type]
    assert battle_view_for(won, "host")["winner"] == "enemy"  # type: ignore[arg-type]
