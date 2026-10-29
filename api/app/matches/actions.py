"""Applying one player's action to a locked match row: a port of act, pickTeam
and takeTurn in server/matches.ts. Returns the changes to write, or a refusal."""

from typing import Any

from app.engine.types import Rng, Seat
from app.engine.versus import (
    clamp_timing,
    create_versus_team,
    resolve_versus_turn,
    versus_send_out,
)
from app.engine.wild import MAX_TEAM
from app.matches.store import Match
from app.matches.views import other


class Refused(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


def _is_index(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _can_switch_to(state: dict[str, Any], seat: str, to: object) -> bool:
    team = state[seat]
    return (
        _is_index(to)
        and to != team["active"]
        and to < len(team["party"])  # type: ignore[operator]
        and team["party"][to]["hp"] > 0  # type: ignore[index]
    )


def apply_action(
    match: Match,
    seat: Seat,
    action: object,
    creatures: dict[int, Any],
    rng: Rng,
) -> dict[str, Any]:
    """The columns to update. `creatures` holds the catalog records a team may use."""
    if not isinstance(action, dict):
        raise Refused(400, "Unknown action")
    kind = action.get("type")
    if kind == "team":
        return _pick_team(match, seat, action.get("creatureIds"), creatures)
    if kind == "forfeit":
        if match["outcome"]:
            raise Refused(409, "The match is over")
        return _finish(other(seat), "forfeit")
    if kind not in ("move", "sendOut", "switch"):
        raise Refused(400, "Unknown action")
    if not match["state"] or match["outcome"]:
        raise Refused(409, "The battle is not running")
    return _take_turn(match, seat, action, rng)


def _finish(winner: str, reason: str) -> dict[str, Any]:
    return {
        "outcome": {"reason": reason, "winner": winner},
        "finished_at": "now",
        "host_pending": None,
        "guest_pending": None,
    }


def _pick_team(match: Match, seat: Seat, ids: object, creatures: dict[int, Any]) -> dict[str, Any]:
    if match["state"] or match["outcome"]:
        raise Refused(409, "The battle has started")
    if match[f"{seat}_team"] is not None:
        raise Refused(409, "Your team is already locked in")
    if (
        not isinstance(ids, list)
        or not 1 <= len(ids) <= MAX_TEAM
        or not all(_is_index(i) and i in creatures for i in ids)
    ):
        raise Refused(400, f"A team is 1 to {MAX_TEAM} known creature ids")
    changes: dict[str, Any] = {f"{seat}_team": ids}
    them = other(seat)
    if match[f"{them}_team"] is not None:
        teams = {seat: ids, them: match[f"{them}_team"]}
        changes["state"] = {
            "guest": create_versus_team([creatures[i] for i in teams["guest"]], "guest"),
            "host": create_versus_team([creatures[i] for i in teams["host"]], "host"),
            "winner": None,
        }
        changes["started_at"] = "now"
        changes["turn"] = 1
    return changes


def _take_turn(match: Match, seat: Seat, action: dict[str, Any], rng: Rng) -> dict[str, Any]:
    state = match["state"]
    team = state[seat]
    if action["type"] == "sendOut":
        if not team["mustSwitch"]:
            raise Refused(409, "Nothing to send out")
        if not _can_switch_to(state, seat, action.get("to")):
            raise Refused(400, "Can't send that creature out")
        result = versus_send_out(state, seat, action["to"])
        return {"state": result["state"], "events": result["events"], "turn": match["turn"] + 1}

    if state["host"]["mustSwitch"] or state["guest"]["mustSwitch"]:
        raise Refused(409, "Waiting for a send-out")
    if match[f"{seat}_pending"] is not None:
        raise Refused(409, "You already acted this turn")

    if action["type"] == "move":
        moves = team["party"][team["active"]]["moves"]
        index = action.get("index")
        if not _is_index(index) or index >= len(moves):  # type: ignore[operator]
            raise Refused(400, "No such move")
        chosen: dict[str, Any] = {
            "index": index,
            "timing": clamp_timing(action.get("timing")),
            "type": "move",
        }
    else:
        if not _can_switch_to(state, seat, action.get("to")):
            raise Refused(400, "Can't switch to that creature")
        chosen = {"to": action["to"], "type": "switch"}

    them = other(seat)
    theirs = match[f"{them}_pending"]
    if theirs is None:
        return {f"{seat}_pending": chosen}
    # Both are in: resolve the turn now, in this same locked transaction.
    actions = {seat: chosen, them: theirs}
    result = resolve_versus_turn(state, actions, rng)  # type: ignore[arg-type]
    changes: dict[str, Any] = {
        "state": result["state"],
        "events": result["events"],
        "turn": match["turn"] + 1,
        "host_pending": None,
        "guest_pending": None,
    }
    winner = result["state"]["winner"]
    if winner:
        changes.update(_finish(winner, "knockout"))
    return changes
