"""One player's view of a match: a port of viewFor in server/matches.ts, in the
MatchView shape from src/lib/versus-api.ts. The opponent's team never appears
before the battle; after, only their active creature and how many still stand."""

from typing import Any

from app.engine.versus import battle_view_for, events_for, standing
from app.matches.store import Match


def other(seat: str) -> str:
    return "guest" if seat == "host" else "host"


def phase_of(match: Match) -> str:
    if match["outcome"]:
        return "over"
    if match["state"]:
        return "battle"
    return "picking" if match["guest_id"] else "waiting"


def view_for(match: Match, seat: str) -> dict[str, Any]:
    them = other(seat)
    state = match["state"]
    outcome = match["outcome"]
    joined = match["guest_id"] is not None
    return {
        "acted": match[f"{seat}_pending"] is not None,
        "battle": battle_view_for(state, seat) if state else None,  # type: ignore[arg-type]
        "events": events_for(match["events"], seat),  # type: ignore[arg-type]
        "opponent": {
            "acted": match[f"{them}_pending"] is not None,
            # An unjoined guest isn't connected, whatever its away flag says.
            "connected": joined and not match[f"{them}_away"],
            "joined": joined,
            "ready": match[f"{them}_team"] is not None,
            "standing": standing(state[them]) if state else 0,
            "switching": state[them]["mustSwitch"] if state else False,
        },
        "outcome": outcome
        and {"reason": outcome["reason"], "winner": "you" if outcome["winner"] == seat else "them"},
        "phase": phase_of(match),
        "ready": match[f"{seat}_team"] is not None,
        "turn": match["turn"],
        "you": seat,
    }
