"""The sweep (sweep() in server/matches.ts): marks seats away, forfeits players who
left, and deletes expired matches. It runs every few seconds on every instance and
at the start of every match request. Each statement only matches rows that still
need the change, so two instances sweeping at once can't do anything twice: the
second UPDATE waits for the first's row lock, re-checks its WHERE, and skips."""

from psycopg import AsyncConnection

from app.matches.store import notify

AWAY_GRACE = "5 seconds"
DISCONNECT = "60 seconds"
# A stream heartbeats every 2 s; silence this long means its instance died
# without closing it.
STALE_HEARTBEAT = "10 seconds"
UNSTARTED = "30 minutes"
FINISHED = "10 minutes"


async def sweep(conn: AsyncConnection) -> list[str]:
    """The ids of the matches it changed (each NOTIFY'd)."""
    changed: list[str] = []

    async def run(query: str) -> None:
        cursor = await conn.execute(query)
        changed.extend(row[0] for row in await cursor.fetchall())

    for seat in ("host", "guest"):
        # A stream whose instance died never ran its "dropped" step.
        await run(
            f"UPDATE matches SET {seat}_left_at = {seat}_seen_at"
            f" WHERE {seat}_stream IS NOT NULL AND {seat}_left_at IS NULL"
            f" AND {seat}_seen_at < now() - interval '{STALE_HEARTBEAT}' RETURNING id"
        )
        await run(
            f"UPDATE matches SET {seat}_away = true"
            f" WHERE NOT {seat}_away AND {seat}_left_at < now() - interval '{AWAY_GRACE}'"
            " RETURNING id"
        )

    # Gone 60 s during a running battle: the other player wins. A seat that dropped
    # before the battle started gets the full 60 s from the start.
    # left_at IS NOT NULL first: Postgres's greatest() skips NULLs, so for a seat
    # that's still connected greatest(NULL, started_at) would be started_at.
    def gone(seat: str) -> str:
        return (
            f"({seat}_left_at IS NOT NULL"
            f" AND greatest({seat}_left_at, started_at) < now() - interval '{DISCONNECT}')"
        )

    await run(
        "UPDATE matches SET"
        " outcome = jsonb_build_object('reason', 'left', 'winner',"
        f"   CASE WHEN {gone('host')} THEN 'guest' ELSE 'host' END),"
        " finished_at = now(), host_pending = NULL, guest_pending = NULL"
        f" WHERE outcome IS NULL AND started_at IS NOT NULL AND ({gone('host')} OR {gone('guest')})"
        " RETURNING id"
    )
    await run(
        "DELETE FROM matches"
        f" WHERE (finished_at < now() - interval '{FINISHED}')"
        f" OR (started_at IS NULL AND created_at < now() - interval '{UNSTARTED}')"
        " RETURNING id"
    )

    ids = list(dict.fromkeys(changed))
    for match_id in ids:
        await notify(conn, match_id)
    return ids
