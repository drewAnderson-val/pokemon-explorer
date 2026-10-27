"""Wild battles, played by the server. The browser sends one action at a time and
plays back the events that come back; the state lives in Postgres between turns."""

import math
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from pydantic import BaseModel, StrictInt

from app.auth.deps import CurrentUser
from app.battles.write_back import write_back
from app.db.pool import get_conn
from app.engine.types import Fighter, Rng
from app.engine.wild import create_battle, create_fighter, resolve_turn, send_out, wild_level
from app.pokemon.queries import find_many
from app.teams.store import load_team, lock_user, save_members

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


class TurnRequest(BaseModel):
    # The turn this action is for. A repeated or stale request (a double click, a
    # retry after the first one went through) names a turn that's already over.
    turn: StrictInt
    action: dict[str, Any]


@router.post("/api/battles/wild/actions", response_model=None)
async def take_turn(
    body: TurnRequest, request: Request, user: CurrentUser, conn: Conn
) -> dict[str, Any] | JSONResponse:
    rng: Rng = request.app.state.rng
    async with conn.transaction():
        # Same lock order as starting a battle and editing the team: user, then battle.
        await lock_user(conn, user.id)
        cursor = await conn.execute(
            "SELECT state, turn FROM wild_battles WHERE user_id = %s FOR UPDATE", (user.id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return error("No battle in progress", 404)
        state, turn = row
        if body.turn != turn:
            return error("That turn is over", 409)
        if state["winner"]:
            return error("The battle is over", 409)

        action = body.action
        sending_out = action.get("type") == "sendOut"
        if state["mustSwitch"] and not sending_out:
            return error("Send out another creature first", 409)
        if sending_out and not state["mustSwitch"]:
            return error("Nothing to send out", 409)
        try:
            result = (
                send_out(state, action.get("to"))  # type: ignore[arg-type]
                if sending_out
                else resolve_turn(state, action, rng)
            )
        except ValueError as problem:
            return error(str(problem), 400)

        await conn.execute(
            "UPDATE wild_battles SET state = %s, turn = turn + 1, updated_at = now()"
            " WHERE user_id = %s",
            (Jsonb(result["state"]), user.id),
        )
        # In the same transaction: the team and the battle never disagree.
        members = await load_team(conn, user.id)
        await save_members(conn, user.id, write_back(members, result["state"]))
    return {"events": result["events"], "state": result["state"], "turn": turn + 1}
