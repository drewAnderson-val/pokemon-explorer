"""Slice 4 passes browser input to the engine. Bad input must be a ValueError (a
400), never a crash, a cheat or a silently different action."""

import math

import pytest

from app.engine.types import BattleState, VersusState
from app.engine.versus import create_versus_team, resolve_versus_turn, versus_send_out
from app.engine.wild import create_battle, resolve_turn, send_out
from tests.engine.golden import pokemon_by_id
from tests.engine.helpers import ScriptedRng, make_fighter

POKEMON = pokemon_by_id()
NO_CRIT = 0.5


def battle() -> BattleState:
    party = [make_fighter(id=1, speed=120, uid="a"), make_fighter(id=3, uid="b")]
    return create_battle(party, make_fighter(id=2, speed=80, uid="w"))


def player_damage(timing: object) -> object:
    events = resolve_turn(
        battle(),
        {"index": 1, "timing": timing, "type": "move"},
        ScriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0),
    )["events"]
    return events[1]["amount"]


@pytest.mark.parametrize("timing", [100, 1000, math.inf, 10**400])
def test_wild_timing_is_capped_at_1_25(timing: object) -> None:
    assert player_damage(timing) == player_damage(1.25)


@pytest.mark.parametrize("timing", [-5, 0, math.nan, None, "abc", "1.2", True])
def test_wild_timing_that_is_not_a_bonus_counts_as_1(timing: object) -> None:
    assert player_damage(timing) == player_damage(1)


@pytest.mark.parametrize("to", [True, 1.0, "1", None, -1, 9])
def test_wild_send_out_rejects_non_index(to: object) -> None:
    state = battle()
    state["party"][0]["hp"] = 0
    state["mustSwitch"] = True
    with pytest.raises(ValueError):
        send_out(state, to)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "action",
    [{}, {"type": "move"}, {"type": "switch"}, {"type": "run"}, {"type": "sendOut", "to": 1}],
)
def test_wild_rejects_malformed_actions(action: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        resolve_turn(battle(), action, ScriptedRng(*[0.5] * 10))


def versus() -> VersusState:
    return {
        "guest": create_versus_team([POKEMON[2], POKEMON[3]], "guest"),
        "host": create_versus_team([POKEMON[1], POKEMON[3]], "host"),
        "winner": None,
    }


@pytest.mark.parametrize("to", [True, 1.0, "1", None])
def test_versus_send_out_rejects_non_index(to: object) -> None:
    state = versus()
    state["host"]["party"][0]["hp"] = 0
    state["host"]["mustSwitch"] = True
    with pytest.raises(ValueError):
        versus_send_out(state, "host", to)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "actions",
    [
        {"host": {"index": 0, "type": "move"}},
        {"guest": {"type": "catch"}, "host": {"index": 0, "type": "move"}},
        {"guest": {}, "host": {"index": 0, "type": "move"}},
        {"guest": {"type": "switch"}, "host": {"index": 0, "type": "move"}},
    ],
)
def test_versus_rejects_malformed_actions(actions: dict[str, dict[str, object]]) -> None:
    with pytest.raises(ValueError):
        resolve_versus_turn(versus(), actions, ScriptedRng(*[0.5] * 10))  # type: ignore[arg-type]


@pytest.mark.parametrize("index", ["garbage", 9, -1, None])
def test_a_bad_move_is_rejected_even_if_the_enemy_would_faint_the_lead_first(
    index: object,
) -> None:
    # Enemy faster, lead at 1 HP: the player never gets to act this turn, so the
    # index must be checked before anything happens, not when the player's go comes.
    party = [make_fighter(id=1, speed=10, hp=1, uid="a"), make_fighter(id=3, uid="b")]
    state = create_battle(party, make_fighter(id=2, speed=200, uid="w"))
    rng = ScriptedRng(*[0.1, 0.0, 0.9, 0.5] * 3)
    with pytest.raises(ValueError):
        resolve_turn(state, {"index": index, "type": "move"}, rng)
    assert rng.calls == 0
