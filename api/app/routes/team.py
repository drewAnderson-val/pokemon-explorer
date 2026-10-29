import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr

from app.auth.deps import CurrentUser
from app.db.pool import get_conn
from app.docs import errors
from app.engine.stats import START_LEVEL, xp_for_level
from app.engine.wild import MAX_TEAM
from app.pokemon.queries import find_many
from app.teams.store import TeamMember, load_team, lock_user, save_members

router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]


class MemberChoice(BaseModel):
    """What the client may say about a team member: which creature, and (for an
    existing member) its uid. Anything else in the request, like a level, is ignored."""

    uid: StrictStr | None = None
    creatureId: StrictInt


class TeamChoice(BaseModel):
    members: list[MemberChoice]

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                # New members: just creature ids, in the order you want them.
                {"members": [{"creatureId": 25}, {"creatureId": 1}]},
            ]
        }
    )


async def team_body(conn: AsyncConnection, members: list[TeamMember]) -> dict[str, Any]:
    """The members plus the creatures they refer to, so the client needs no lookups."""
    creatures = await find_many(conn, [m["creatureId"] for m in members])
    return {"members": members, "creatures": {str(k): v for k, v in creatures.items()}}


def error(message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=400)


@router.get(
    "/api/team",
    summary="Your team, plus the creatures on it",
    responses=errors(401),
)
async def get_team(user: CurrentUser, conn: Conn) -> dict[str, Any]:
    return await team_body(conn, await load_team(conn, user.id))


@router.put(
    "/api/team",
    response_model=None,
    summary="Choose your team's creatures and order (the server keeps their stats)",
    responses=errors(400, 401),
)
async def put_team(
    choice: TeamChoice, user: CurrentUser, conn: Conn
) -> dict[str, Any] | JSONResponse:
    ids = [m.creatureId for m in choice.members]
    if len(ids) > MAX_TEAM:
        return error(f"A team is 0 to {MAX_TEAM} creatures")
    if len(set(ids)) != len(ids):
        return error("Each creature can only be on the team once")
    known = await find_many(conn, ids)
    missing = next((i for i in ids if i not in known), None)
    if missing is not None:
        return error(f"No creature #{missing}")

    async with conn.transaction():
        await lock_user(conn, user.id)
        current = {m["uid"]: m for m in await load_team(conn, user.id)}
        members: list[TeamMember] = []
        for choice_member in choice.members:
            kept = current.get(choice_member.uid or "")
            if kept and kept["creatureId"] == choice_member.creatureId:
                # An existing member keeps its stats; only its position can change.
                members.append(kept)
            else:
                members.append(
                    {
                        "creatureId": choice_member.creatureId,
                        "hp": None,
                        "level": START_LEVEL,
                        "uid": secrets.token_hex(8),
                        "xp": xp_for_level(START_LEVEL),
                    }
                )
        await save_members(conn, user.id, members)
    return await team_body(conn, members)


@router.post(
    "/api/team/rest",
    summary="Heal the whole team",
    responses=errors(401),
)
async def rest_team(user: CurrentUser, conn: Conn) -> dict[str, Any]:
    async with conn.transaction():
        await lock_user(conn, user.id)
        await conn.execute("UPDATE team_members SET hp = NULL WHERE user_id = %s", (user.id,))
    return await team_body(conn, await load_team(conn, user.id))
