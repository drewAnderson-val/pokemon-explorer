"""Friend matches: two signed-in players, simultaneous turns, live views."""

import hashlib
import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection

from app.auth.deps import CurrentUser
from app.db.pool import get_conn
from app.docs import errors
from app.matches.actions import Refused, apply_action
from app.matches.store import create_match, load_match, notify, save_changes, seat_of
from app.matches.views import view_for
from app.pokemon.queries import find_many

router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]

LIMIT_MESSAGES = {
    429: "You've started a lot of matches! Try again later.",
    503: "Too many open matches. Try again soon.",
}


def error(message: str, status_code: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code)


@router.post(
    "/api/matches",
    summary="Start a friend match; share its id as an invite",
    status_code=201,
    responses=errors(401, 503),
)
async def create(user: CurrentUser, conn: Conn) -> JSONResponse:
    created = await create_match(conn, user.id)
    if isinstance(created, int):
        return error(LIMIT_MESSAGES[created], created)
    return JSONResponse({"matchId": created}, status_code=201)


@router.post(
    "/api/matches/{match_id}/join",
    summary="Take the guest seat (or get your seat back: joining again is harmless)",
    responses=errors(401, 404, 409),
)
async def join(match_id: str, user: CurrentUser, conn: Conn) -> JSONResponse:
    async with conn.transaction():
        match = await load_match(conn, match_id, lock=True)
        if match is None:
            return error("No such match", 404)
        seat = seat_of(match, user.id)
        if seat:
            return JSONResponse({"seat": seat})
        if match["outcome"]:
            return error("The match is over", 409)
        if match["guest_id"] is not None:
            return error("The match is full", 409)
        await conn.execute(
            "UPDATE matches SET guest_id = %s, guest_left_at = now() WHERE id = %s",
            (user.id, match_id),
        )
        await notify(conn, match_id)
    return JSONResponse({"seat": "guest"})


@router.get(
    "/api/matches/{match_id}",
    summary="Your view of a match right now",
    responses=errors(401, 404),
    response_model=None,
)
async def current_view(
    match_id: str, user: CurrentUser, conn: Conn
) -> dict[str, Any] | JSONResponse:
    match = await load_match(conn, match_id)
    seat = match and seat_of(match, user.id)
    # Not a player: the same 404 as no match, so outsiders learn nothing.
    if not match or not seat:
        return error("No such match", 404)
    return view_for(match, seat)


# Actions that change a turn must carry a key: a retried request (the answer was
# lost) then gets the first answer instead of being applied twice.
NEEDS_KEY = {"move", "sendOut", "switch"}
MAX_BODY = 2048

ACTION_BODY: dict[str, Any] = {
    "required": True,
    "content": {
        "application/json": {
            "schema": {
                "type": "object",
                "required": ["action"],
                "properties": {"action": {"type": "object"}},
            },
            "examples": {
                "team": {
                    "summary": "Lock in your team",
                    "value": {"action": {"type": "team", "creatureIds": [25, 1, 4]}},
                },
                "move": {
                    "summary": "Use move 0",
                    "value": {"action": {"type": "move", "index": 0, "timing": 1.1}},
                },
                "switch": {
                    "summary": "Swap to slot 1",
                    "value": {"action": {"type": "switch", "to": 1}},
                },
                "sendOut": {
                    "summary": "After a faint: send out slot 1",
                    "value": {"action": {"type": "sendOut", "to": 1}},
                },
                "forfeit": {"summary": "Give up", "value": {"action": {"type": "forfeit"}}},
            },
        }
    },
}


@router.post(
    "/api/matches/{match_id}/actions",
    summary="Lock in a team, move, switch, send out or forfeit",
    description=(
        "Moves, switches and send-outs need an Idempotency-Key header (any unique "
        "string per action). Sending the same key again returns the first answer."
    ),
    status_code=204,
    responses=errors(400, 401, 404, 409),
    openapi_extra={"requestBody": ACTION_BODY},
)
async def take_action(
    match_id: str,
    request: Request,
    user: CurrentUser,
    conn: Conn,
    idempotency_key: Annotated[str | None, Header()] = None,
) -> Response:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        return error("That request is too big", 413)
    try:
        action = json.loads(raw)["action"]
    except (ValueError, KeyError, TypeError):
        return error("Send an action", 400)
    kind = action.get("type") if isinstance(action, dict) else None
    if kind in NEEDS_KEY and not idempotency_key:
        return error("Send an Idempotency-Key header with each move", 400)
    request_hash = hashlib.sha256(json.dumps(action, sort_keys=True).encode()).hexdigest()

    async with conn.transaction():
        # Both players' requests for this match queue here, one at a time: the
        # second sees the first's pending move and resolves the turn.
        match = await load_match(conn, match_id, lock=True)
        seat = match and seat_of(match, user.id)
        if not match or not seat:
            return error("No such match", 404)

        if idempotency_key:
            cursor = await conn.execute(
                "SELECT request_hash, status FROM match_actions"
                " WHERE match_id = %s AND user_id = %s AND idempotency_key = %s",
                (match_id, user.id, idempotency_key),
            )
            seen = await cursor.fetchone()
            if seen:
                if seen[0] != request_hash:
                    return error("That key was used for a different action", 409)
                return Response(status_code=seen[1])

        # A team action may start the battle, which needs both teams' creatures.
        ids = action.get("creatureIds") if kind == "team" else None
        wanted = [i for i in ids if isinstance(i, int)] if isinstance(ids, list) else []
        wanted += (match["host_team"] or []) + (match["guest_team"] or [])
        creatures = await find_many(conn, wanted) if kind == "team" else {}
        try:
            changes = apply_action(match, seat, action, creatures, request.app.state.rng)  # type: ignore[arg-type]
        except Refused as refusal:
            return error(str(refusal), refusal.status)

        await save_changes(conn, match_id, changes)
        if idempotency_key:
            await conn.execute(
                "INSERT INTO match_actions"
                " (match_id, user_id, idempotency_key, request_hash, status)"
                " VALUES (%s, %s, %s, %s, 204)",
                (match_id, user.id, idempotency_key, request_hash),
            )
        await notify(conn, match_id)
    return Response(status_code=204)
