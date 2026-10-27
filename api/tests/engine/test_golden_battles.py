"""Replays every battle recorded from the TypeScript engine and requires identical
events, states and number of random draws."""

from typing import Any

import pytest

from app.engine.types import BattleState, VersusState
from app.engine.versus import (
    battle_view_for,
    clamp_timing,
    create_versus_team,
    events_for,
    resolve_versus_turn,
    versus_send_out,
)
from app.engine.wild import create_battle, create_fighter, resolve_turn, send_out, wild_level
from tests.engine.golden import assert_same_json, pokemon_by_id, scenarios
from tests.engine.helpers import ScriptedRng

POKEMON = pokemon_by_id()
WILD = [s for s in scenarios() if s["kind"] == "wild"]
VERSUS = [s for s in scenarios() if s["kind"] == "versus"]


def wild_state(setup: dict[str, Any]) -> BattleState:
    party = [
        create_fighter(POKEMON[m["id"]], m["level"], uid=f"p{i}", hp=m.get("hp"), xp=m.get("xp"))
        for i, m in enumerate(setup["party"])
    ]
    e = setup["enemy"]
    enemy = create_fighter(POKEMON[e["id"]], e["level"], uid="wild", hp=e.get("hp"))
    return create_battle(party, enemy)


@pytest.mark.parametrize("scenario", WILD, ids=[s["name"] for s in WILD])
def test_wild_battle_matches_typescript(scenario: dict[str, Any]) -> None:
    state = wild_state(scenario["setup"])
    for n, step in enumerate(scenario["steps"]):
        where = f"step {n} ({step['call']})"
        expected = step["result"]
        if step["call"] == "resolveTurn":
            rng = ScriptedRng(*step["rng"])
            result = resolve_turn(state, step["action"], rng)
            assert_same_json(dict(result), {k: expected[k] for k in ("events", "state")}, where)
            assert rng.calls == expected["rngUsed"], f"{where}: random draws"
            state = result["state"]
        elif step["call"] == "sendOut":
            result = send_out(state, step["to"])
            assert_same_json(dict(result), {k: expected[k] for k in ("events", "state")}, where)
            state = result["state"]
        elif step["call"] == "wildLevel":
            rng = ScriptedRng(*step["rng"])
            assert wild_level(step["levels"], rng) == expected["value"], where
            assert rng.calls == expected["rngUsed"], f"{where}: random draws"
        else:
            raise AssertionError(f"unknown step {step['call']}")


def versus_state(setup: dict[str, Any]) -> VersusState:
    state: VersusState = {
        "guest": create_versus_team([POKEMON[i] for i in setup["guest"]], "guest"),
        "host": create_versus_team([POKEMON[i] for i in setup["host"]], "host"),
        "winner": None,
    }
    for seat, hps in setup.get("hp", {}).items():
        for i, hp in enumerate(hps):
            if hp is not None:
                team = state["host"] if seat == "host" else state["guest"]
                team["party"][i]["hp"] = hp
    return state


@pytest.mark.parametrize("scenario", VERSUS, ids=[s["name"] for s in VERSUS])
def test_versus_battle_matches_typescript(scenario: dict[str, Any]) -> None:
    state = versus_state(scenario["setup"])
    last_events: list[Any] = []
    for n, step in enumerate(scenario["steps"]):
        where = f"step {n} ({step['call']})"
        expected = step["result"]
        call = step["call"]
        if call == "resolveVersusTurn":
            rng = ScriptedRng(*step["rng"])
            result = resolve_versus_turn(state, step["actions"], rng)
            assert_same_json(dict(result), {k: expected[k] for k in ("events", "state")}, where)
            assert rng.calls == expected["rngUsed"], f"{where}: random draws"
            state, last_events = result["state"], result["events"]
        elif call == "versusSendOut":
            result = versus_send_out(state, step["seat"], step["to"])
            assert_same_json(dict(result), {k: expected[k] for k in ("events", "state")}, where)
            state, last_events = result["state"], result["events"]
        elif call == "battleViewFor":
            assert_same_json(dict(battle_view_for(state, step["seat"])), expected, where)
        elif call == "eventsFor":
            assert_same_json(events_for(last_events, step["seat"]), expected, where)
        elif call == "clampTiming":
            assert_same_json([clamp_timing(v) for v in step["values"]], expected, where)
        else:
            raise AssertionError(f"unknown step {call}")
