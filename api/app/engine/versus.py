"""Friend battles: a port of src/lib/battle/versus.ts.

Pure two-team rules. Events are written from the host's side (host = "player",
guest = "enemy"); `events_for` flips them for the guest.
"""

import math

from app.engine.types import (
    BattleEvent,
    BattleState,
    Fighter,
    Pokemon,
    Rng,
    Seat,
    Side,
    VersusState,
    VersusTeam,
    VersusTurnResult,
)
from app.engine.wild import create_fighter, strike, turn_order

VERSUS_LEVEL = 50
NO_BAR_BONUS = 1.125
MAX_TIMING = 1.25

# {"type": "move", "index", "timing"} or {"type": "switch", "to"}.
VersusAction = dict[str, object]


def other_seat(seat: Seat) -> Seat:
    return "guest" if seat == "host" else "host"


def _side_of(seat: Seat) -> Side:
    return "player" if seat == "host" else "enemy"


def _active_of(team: VersusTeam) -> Fighter:
    return team["party"][team["active"]]


def clamp_timing(value: object) -> float:
    """Non-numbers count as 1; anything else is held to 1–1.25. A bool isn't a
    number here (Python's True is an int; JS's typeof true is "boolean")."""
    if isinstance(value, bool) or not isinstance(value, int | float) or math.isnan(value):
        return 1
    return min(MAX_TIMING, max(1, value))


def create_versus_team(creatures: list[Pokemon], seat: Seat) -> VersusTeam:
    return {
        "active": 0,
        "mustSwitch": False,
        "party": [
            create_fighter(creature, VERSUS_LEVEL, uid=f"{seat}-{index}")
            for index, creature in enumerate(creatures)
        ],
    }


def standing(team: VersusTeam) -> int:
    return sum(1 for fighter in team["party"] if fighter["hp"] > 0)


def battle_view_for(state: VersusState, seat: Seat) -> BattleState:
    """The seat's own view, shaped like a wild battle so the same scene renders it."""
    team = state[seat]
    winner = state["winner"]
    return {
        "active": team["active"],
        "caught": False,
        "enemy": _active_of(state[other_seat(seat)]),
        "mustSwitch": team["mustSwitch"],
        "party": team["party"],
        "versus": True,
        "winner": None if winner is None else ("player" if winner == seat else "enemy"),
    }


def events_for(events: list[BattleEvent], seat: Seat) -> list[BattleEvent]:
    if seat == "host":
        return events

    def flip(side: object) -> Side:
        return "enemy" if side == "player" else "player"

    flipped: list[BattleEvent] = []
    for event in events:
        if event["type"] == "damage":
            flipped.append({**event, "target": flip(event["target"])})
        elif event.get("side"):
            flipped.append({**event, "side": flip(event["side"])})
        else:
            flipped.append(event)
    return flipped


def resolve_versus_turn(
    state: VersusState, actions: dict[Seat, VersusAction], rng: Rng
) -> VersusTurnResult:
    """One turn. Switches go first (host, then guest); then the chosen moves in
    speed order. The turn stops when someone faints."""
    if state["winner"] or state["host"]["mustSwitch"] or state["guest"]["mustSwitch"]:
        return {"events": [], "state": state}
    nxt = _draft(state)
    events: list[BattleEvent] = []

    seats: tuple[Seat, Seat] = ("host", "guest")
    for seat in seats:
        action = actions[seat]
        if action["type"] == "switch":
            _switch_to(nxt, seat, _int(action["to"]), events)

    movers = [seat for seat in seats if actions[seat]["type"] == "move"]
    if len(movers) == 2:
        speeds = turn_order(
            _active_of(nxt["host"])["stats"]["speed"],
            _active_of(nxt["guest"])["stats"]["speed"],
            rng,
        )
        order: list[Seat] = ["host" if side == "player" else "guest" for side in speeds]
    else:
        order = movers
    for seat in order:
        _attack(nxt, seat, actions[seat], rng, events)
        if nxt["winner"] or nxt["host"]["mustSwitch"] or nxt["guest"]["mustSwitch"]:
            break

    return {"events": events, "state": nxt}


def versus_send_out(state: VersusState, seat: Seat, to: int) -> VersusTurnResult:
    """After a faint: send out another creature. Free, so nobody else acts."""
    if not state[seat]["mustSwitch"]:
        return {"events": [], "state": state}
    nxt = _draft(state)
    events: list[BattleEvent] = []
    _switch_to(nxt, seat, to, events)
    return {"events": events, "state": nxt}


def _int(value: object) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"Expected an integer, got {value!r}")
    return value


def _attack(
    state: VersusState, seat: Seat, action: VersusAction, rng: Rng, events: list[BattleEvent]
) -> None:
    target_seat = other_seat(seat)
    attacker = _active_of(state[seat])
    defender = _active_of(state[target_seat])
    index = _int(action["index"])
    if not 0 <= index < len(attacker["moves"]):
        raise ValueError(f"No move {index} for {seat}")
    struck = strike(
        attacker,
        defender,
        attacker["moves"][index],
        rng,
        _side_of(seat),
        _side_of(target_seat),
        clamp_timing(action.get("timing")),
        events,
    )
    if struck and defender["hp"] == 0:
        _faint(state, target_seat, events)


def _draft(state: VersusState) -> VersusState:
    """Copies everything a turn changes, so the input state is untouched."""

    def copy(team: VersusTeam) -> VersusTeam:
        return {**team, "party": [Fighter(**f) for f in team["party"]]}

    return {**state, "guest": copy(state["guest"]), "host": copy(state["host"])}


def _faint(state: VersusState, seat: Seat, events: list[BattleEvent]) -> None:
    events.append({"side": _side_of(seat), "type": "faint"})
    if standing(state[seat]) > 0:
        state[seat]["mustSwitch"] = True
    else:
        state["winner"] = other_seat(seat)


def _switch_to(state: VersusState, seat: Seat, to: int, events: list[BattleEvent]) -> None:
    team = state[seat]
    party = team["party"]
    if not 0 <= to < len(party) or to == team["active"] or party[to]["hp"] == 0:
        raise ValueError(f"Can't switch to {to}")
    incoming = party[to]
    came_from = None if team["mustSwitch"] else _active_of(team)["creature"]["name"]
    team["active"] = to
    team["mustSwitch"] = False
    events.append(
        {"fighter": dict(incoming), "from": came_from, "side": _side_of(seat), "type": "switch"}
    )
