"""A user's team in Postgres. Callers run these inside a transaction that has
called lock_user first, so one user's team changes happen one at a time."""

from typing import TypedDict
from uuid import UUID

from psycopg import AsyncConnection


class TeamMember(TypedDict):
    """The client's TeamMember shape (src/lib/team/team.ts)."""

    creatureId: int
    # None means full HP.
    hp: int | None
    level: int
    uid: str
    xp: int


async def lock_user(conn: AsyncConnection, user_id: UUID) -> None:
    """Serializes everything that rewrites this user's team (team edits, battle
    results). Without it, two requests could each read the team, change it and
    write it back, and the second would silently undo the first."""
    await conn.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))


async def load_team(conn: AsyncConnection, user_id: UUID) -> list[TeamMember]:
    cursor = await conn.execute(
        "SELECT pokemon_id, hp, level, uid, xp FROM team_members WHERE user_id = %s ORDER BY slot",
        (user_id,),
    )
    return [
        {"creatureId": pokemon_id, "hp": hp, "level": level, "uid": uid, "xp": xp}
        for pokemon_id, hp, level, uid, xp in await cursor.fetchall()
    ]


async def save_members(conn: AsyncConnection, user_id: UUID, members: list[TeamMember]) -> None:
    """Replaces the team: slot = position in the list."""
    await conn.execute("DELETE FROM team_members WHERE user_id = %s", (user_id,))
    for slot, m in enumerate(members):
        await conn.execute(
            "INSERT INTO team_members (user_id, uid, slot, pokemon_id, level, xp, hp)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (user_id, m["uid"], slot, m["creatureId"], m["level"], m["xp"], m["hp"]),
        )
