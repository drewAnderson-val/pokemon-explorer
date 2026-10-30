"""The Creature Lab: make a creature (drawn by Vertex AI, stored in the bucket and
in pokemon), list yours, delete one."""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection

from app.auth.deps import CurrentUser, ReleasedUser
from app.db.pool import get_conn
from app.docs import CREATURE_BODY, errors
from app.lab.images import ImageBlocked, ImageBusy, ImageGenerator
from app.lab.limits import take_lab_slot
from app.lab.request import build_prompt, parse_creature_request, roll_creature
from app.lab.storage import ImageStore
from app.pokemon.queries import COLUMNS, to_json

logger = logging.getLogger(__name__)
router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]

MAX_BODY = 4 * 1024
JAMMED = "The drawing machine jammed. Try again."
BUSY = "The lab is busy right now. Try again in a minute."


@dataclass(frozen=True)
class Lab:
    """What the lab needs from Google: None at app.state.lab when not configured."""

    generator: ImageGenerator
    store: ImageStore
    # Seconds to wait for a drawing before answering "busy". They take a few
    # seconds; a hung call would otherwise hold the request open.
    timeout: float = 90.0


def error(message: str, status_code: int, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code, headers=headers)


@router.post(
    "/api/creatures",
    summary="Make a creature: the lab draws it and adds it to your collection",
    description="5 per account per hour, 100 a day for everyone: each drawing costs money.",
    status_code=201,
    responses=errors(400, 401, 413, 422, 429, 502, 503),
    openapi_extra={"requestBody": CREATURE_BODY},
)
async def make_creature(request: Request, user: ReleasedUser) -> JSONResponse:
    # No connection is held for this request: a drawing takes seconds, and the
    # pool is small. The slot and the insert each borrow one briefly.
    raw = await read_capped(request)
    if raw is None:
        return error("That request is too big", 413)
    try:
        body: object = json.loads(raw)
    except ValueError:
        body = None
    parsed = parse_creature_request(body)
    if isinstance(parsed, str):
        return error(parsed, 400)
    lab: Lab | None = request.app.state.lab
    if lab is None:
        return error("The creature lab is not configured here.", 503)

    # Counted and committed before drawing: a drawing takes seconds, and the
    # limit's locks would stall this user's team and battles all that time.
    pool = request.app.state.pool
    async with pool.connection() as conn, conn.transaction():
        refused = await take_lab_slot(conn, user.id)
    if refused:
        return error(refused, 429)

    try:
        async with asyncio.timeout(lab.timeout):
            image = await lab.generator(build_prompt(parsed))
    except (ImageBusy, TimeoutError):
        return error(BUSY, 503, {"Retry-After": "60"})
    except ImageBlocked:
        return error("That creature couldn't be drawn. Try a different idea.", 422)
    except Exception:
        logger.exception("Image generation failed")
        return error(JAMMED, 502)
    try:
        url = await lab.store.save(image.data, image.mime_type)
    except Exception:
        logger.exception("Saving the image failed")
        return error(JAMMED, 502)

    creature = roll_creature(parsed, url, request.app.state.rng)
    try:
        async with pool.connection() as conn:
            row = await insert_creature(conn, creature, user.id)
    except Exception:
        logger.exception("Saving the creature failed")
        # Nothing points at the image now; don't leave it in the bucket.
        try:
            await lab.store.delete(url)
        except Exception:
            logger.exception("Deleting the unsaved image failed")
        return error(JAMMED, 502)
    return JSONResponse({"creature": to_json(row)}, status_code=201)


async def read_capped(request: Request) -> bytes | None:
    """The body, or None when it's over MAX_BODY: refused by its declared length
    before reading, and never read past the limit otherwise."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY:
        return None
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY:
            return None
    return body


async def insert_creature(conn: AsyncConnection, creature: dict[str, Any], owner: Any) -> Any:
    cursor = await conn.execute(
        "INSERT INTO pokemon (id, owner_id, name, types, height, weight, hp, attack, defense,"
        " special_attack, special_defense, speed, description, image_url, generation,"
        " is_legendary)"
        " VALUES (nextval('pokemon_custom_id_seq'), %(owner)s, %(name)s, %(types)s, %(height)s,"
        " %(weight)s, %(hp)s, %(attack)s, %(defense)s, %(specialAttack)s, %(specialDefense)s,"
        " %(speed)s, %(description)s, %(imageUrl)s, %(generation)s, %(isLegendary)s)"
        f" RETURNING {COLUMNS}",
        {**creature, "owner": owner},
    )
    row = await cursor.fetchone()
    assert row
    return row


@router.get(
    "/api/creatures",
    summary="Your creatures, newest first",
    responses=errors(401),
)
async def list_creatures(user: CurrentUser, conn: Conn) -> dict[str, Any]:
    cursor = await conn.execute(
        f"SELECT {COLUMNS} FROM pokemon WHERE owner_id = %s ORDER BY id DESC", (user.id,)
    )
    return {"data": [to_json(row) for row in await cursor.fetchall()]}


@router.delete(
    "/api/creatures/{creature_id}",
    summary="Delete one of your creatures (it leaves your team too)",
    status_code=204,
    responses=errors(401, 404, 409),
)
async def delete_creature(
    creature_id: int, request: Request, user: CurrentUser, conn: Conn
) -> Response:
    async with conn.transaction():
        # The team routes' lock: a team edit can't land halfway through this.
        await conn.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user.id,))
        cursor = await conn.execute(
            "SELECT image_url FROM pokemon WHERE id = %s AND owner_id = %s FOR UPDATE",
            (creature_id, user.id),
        )
        found = await cursor.fetchone()
        if found is None:
            return error(f"No creature #{creature_id}", 404)
        # A locked-in team is a list of ids; the battle would fail to start without it.
        cursor = await conn.execute(
            "SELECT 1 FROM matches WHERE outcome IS NULL"
            " AND (%s = ANY(host_team) OR %s = ANY(guest_team))",
            (creature_id, creature_id),
        )
        if await cursor.fetchone():
            return error("That creature is in a friend match", 409)
        # team_members cascades: it leaves the team in the same commit.
        await conn.execute("DELETE FROM pokemon WHERE id = %s", (creature_id,))

    lab: Lab | None = request.app.state.lab
    if lab is not None:
        try:
            await lab.store.delete(found[0])
        except Exception:
            # The creature is gone either way; an orphaned image only costs storage.
            logger.exception("Deleting the image failed")
    return Response(status_code=204)
