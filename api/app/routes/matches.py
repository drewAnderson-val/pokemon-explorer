"""Friend matches: two signed-in players, simultaneous turns, live views."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection

from app.auth.deps import CurrentUser
from app.db.pool import get_conn
from app.docs import errors
from app.matches.store import create_match, load_match, notify, seat_of
from app.matches.views import view_for

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
