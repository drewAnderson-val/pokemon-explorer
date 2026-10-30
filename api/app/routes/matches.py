"""Friend matches: two signed-in players, simultaneous turns, live views."""

import asyncio
import contextlib
import hashlib
import json
import time
from collections.abc import AsyncIterator
from typing import Annotated, Any
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from psycopg import AsyncConnection, sql

from app.auth.deps import CurrentUser
from app.auth.tokens import InvalidToken, read_token
from app.db.pool import get_conn
from app.docs import errors
from app.matches.actions import Refused, apply_action
from app.matches.live import GONE, UNAUTHORIZED, LiveMatches, Stream, frame
from app.matches.store import create_match, load_match, notify, save_changes, seat_of
from app.matches.sweep import sweep
from app.matches.views import view_for
from app.pokemon.queries import find_many, find_usable

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
    await sweep(conn)
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
    await sweep(conn)
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
    await sweep(conn)
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
    await sweep(conn)
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
        creatures: dict[int, Any] = {}
        if kind == "team":
            # Teams already locked in were checked when they were; the new one may
            # only use the catalog and this player's own creatures. An id that's
            # neither is left out, so the lock-in is refused as unknown.
            locked = (match["host_team"] or []) + (match["guest_team"] or [])
            creatures = await find_many(conn, locked)
            for i in wanted:
                creatures.pop(i, None)
            # FOR SHARE: a delete of one of them can't slip in before this commits.
            creatures |= await find_usable(conn, wanted, user.id, lock=True)
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


HEARTBEAT_SECONDS = 2


@router.get(
    "/api/matches/{match_id}/events",
    summary="Live views of a match (server-sent events)",
    description=(
        "Always 200 text/event-stream: an EventSource can't read an error status. "
        "Events: `view` (your view, now and after every change), `gone` (no such "
        "match, or not yours), `unauthorized` (a missing or expired token: sign in "
        "again), `replaced` (you opened a newer stream). "
        "EventSource can't send headers, so the token goes in `?token=`."
    ),
    response_class=StreamingResponse,
)
async def match_events(match_id: str, request: Request, token: str = "") -> StreamingResponse:
    return StreamingResponse(
        _stream(request, match_id, token),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream(request: Request, match_id: str, token: str) -> AsyncIterator[str]:
    app = request.app
    pool = app.state.pool
    live: LiveMatches = app.state.live
    try:
        user_id = read_token(token, app.state.settings.jwt_secret)
    except InvalidToken:
        yield UNAUTHORIZED
        return

    stream_id = uuid4().hex
    async with pool.connection() as conn, conn.transaction():
        match = await load_match(conn, match_id, lock=True)
        seat = match and seat_of(match, user_id)
        if seat:
            # This stream is now the seat's one: present, and the older stream
            # (if any, on any instance) learns it's been replaced.
            await conn.execute(
                sql.SQL(
                    "UPDATE matches SET {stream} = %s, {away} = false, {left} = NULL,"
                    " {seen} = now() WHERE id = %s"
                ).format(
                    stream=sql.Identifier(f"{seat}_stream"),
                    away=sql.Identifier(f"{seat}_away"),
                    left=sql.Identifier(f"{seat}_left_at"),
                    seen=sql.Identifier(f"{seat}_seen_at"),
                ),
                (stream_id, match_id),
            )
            await notify(conn, match_id)
            match = await load_match(conn, match_id)
    if not match or not seat:
        yield GONE
        return

    stream = Stream(match_id, seat, stream_id)
    live.add(stream)
    try:
        first = frame("view", view_for(match, seat))
        stream.last_sent = first
        yield first
        ping_every = getattr(app.state, "sse_ping_seconds", 25)
        last_ping = last_beat = time.monotonic()
        while not await request.is_disconnected():
            try:
                data, last = await asyncio.wait_for(stream.queue.get(), timeout=min(ping_every, 1))
                yield data
                if last:
                    return
            except TimeoutError:
                pass
            now = time.monotonic()
            if now - last_beat >= HEARTBEAT_SECONDS:
                last_beat = now
                await _heartbeat(pool, match_id, seat, stream_id)
            if now - last_ping >= ping_every:
                last_ping = now
                # A comment line: keeps proxies from closing an idle stream.
                yield ": ping\n\n"
    finally:
        live.remove(stream)
        # Dropped (unless a newer stream already took the seat): the sweep marks the
        # seat away after 5 s and forfeits it after 60 s.
        # Shielded: when the client disconnects, the server cancels this generator,
        # and an unshielded await here would be cancelled before it ran.
        with anyio.CancelScope(shield=True), contextlib.suppress(Exception):
            await _mark(pool, match_id, seat, stream_id, "{left} = now()")


async def _mark(pool: Any, match_id: str, seat: str, stream_id: str, assignment: str) -> None:
    query = sql.SQL("UPDATE matches SET " + assignment + " WHERE id = %s AND {stream} = %s").format(
        seen=sql.Identifier(f"{seat}_seen_at"),
        left=sql.Identifier(f"{seat}_left_at"),
        stream=sql.Identifier(f"{seat}_stream"),
    )
    async with pool.connection() as conn:
        await conn.execute(query, (match_id, stream_id))


async def _heartbeat(pool: Any, match_id: str, seat: str, stream_id: str) -> None:
    """This stream is still alive. If a sweep marked the seat away or gone during a
    stall (a slow database, a busy instance), the stream never closed, so the seat
    is back: restore it and tell the opponent."""
    names = {
        "seen": sql.Identifier(f"{seat}_seen_at"),
        "left": sql.Identifier(f"{seat}_left_at"),
        "away": sql.Identifier(f"{seat}_away"),
        "stream": sql.Identifier(f"{seat}_stream"),
    }
    async with pool.connection() as conn, conn.transaction():
        cursor = await conn.execute(
            sql.SQL(
                "UPDATE matches SET {away} = false, {left} = NULL"
                " WHERE id = %s AND {stream} = %s AND ({away} OR {left} IS NOT NULL)"
                " RETURNING id"
            ).format(**names),
            (match_id, stream_id),
        )
        if await cursor.fetchone():
            await notify(conn, match_id)
        await conn.execute(
            sql.SQL("UPDATE matches SET {seen} = now() WHERE id = %s AND {stream} = %s").format(
                **names
            ),
            (match_id, stream_id),
        )
