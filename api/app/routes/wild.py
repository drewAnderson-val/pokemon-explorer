"""Wild battles, played by the server. The browser sends one action at a time and
plays back the events that come back; the state lives in Postgres between turns."""

import math
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from app.auth.deps import CurrentUser
from app.db.pool import get_conn
from app.engine.types import Fighter, Rng
from app.engine.wild import create_battle, create_fighter, wild_level
from app.pokemon.queries import find_many
from app.teams.store import load_team, lock_user

router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]


def error(message: str, status_code: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code)


@router.post("/api/battles/wild", response_model=None)
async def start(request: Request, user: CurrentUser, conn: Conn) -> JSONResponse:
    rng: Rng = request.app.state.rng
    async with conn.transaction():
        await lock_user(conn, user.id)
        members = await load_team(conn, user.id)
        if not members:
            return error("Add a creature to your team first", 409)
        if all(m["hp"] == 0 for m in members):
            return error("Your team needs a rest", 409)

        creatures = await find_many(conn, [m["creatureId"] for m in members])
        party: list[Fighter] = [
            create_fighter(
                creatures[m["creatureId"]],  # type: ignore[arg-type]
                m["level"],
                uid=m["uid"],
                hp=m["hp"],
                xp=m["xp"],
            )
            for m in members
        ]

        # A random catalog creature not on the team, then a level near the team's:
        # the same two draws, in the same order, as the browser version.
        cursor = await conn.execute(
            "SELECT id FROM pokemon WHERE id <> ALL(%s) ORDER BY id",
            ([m["creatureId"] for m in members],),
        )
        ids = [row[0] for row in await cursor.fetchall()]
        enemy_id = ids[min(math.floor(rng() * len(ids)), len(ids) - 1)]
        enemy_creature = (await find_many(conn, [enemy_id]))[enemy_id]
        level = wild_level([f["level"] for f in party], rng)
        enemy = create_fighter(enemy_creature, level, uid=f"wild-{secrets.token_hex(6)}")  # type: ignore[arg-type]

        state = create_battle(party, enemy)
        await conn.execute(
            "INSERT INTO wild_battles (user_id, state, turn) VALUES (%s, %s, 0)"
            " ON CONFLICT (user_id) DO UPDATE"
            " SET state = EXCLUDED.state, turn = 0, created_at = now(), updated_at = now()",
            (user.id, Jsonb(state)),
        )
    return JSONResponse({"state": state, "turn": 0}, status_code=201)


@router.get("/api/battles/wild", response_model=None)
async def current(user: CurrentUser, conn: Conn) -> dict[str, Any] | JSONResponse:
    cursor = await conn.execute(
        "SELECT state, turn FROM wild_battles WHERE user_id = %s", (user.id,)
    )
    row = await cursor.fetchone()
    if row is None:
        return error("No battle in progress", 404)
    return {"state": row[0], "turn": row[1]}


@router.delete("/api/battles/wild", status_code=204)
async def run_away(user: CurrentUser, conn: Conn) -> Response:
    async with conn.transaction():
        await conn.execute("DELETE FROM wild_battles WHERE user_id = %s", (user.id,))
    return Response(status_code=204)
