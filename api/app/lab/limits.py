"""The lab's rate limits, kept in Postgres so every instance shares them and a
deploy doesn't reset them: 5 requests per user per hour, 100 a day overall.
Every request counts, not only successes: a blocked image costs money too."""

from uuid import UUID

from psycopg import AsyncConnection

PER_USER_PER_HOUR = 5
PER_DAY = 100
# Any fixed number: everyone taking the daily count waits on this one lock.
DAILY_LOCK = 61_001


async def take_lab_slot(conn: AsyncConnection, user_id: UUID) -> str | None:
    """Counts this request and returns None, or returns the 429 message. Call it in
    a transaction that commits before the image is drawn: the locks below are held
    until then, and a drawing takes seconds."""
    # One user's requests take turns (the same lock the team routes use), so two
    # at once can't both see 4 and both take the 5th.
    await conn.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user_id,))
    cursor = await conn.execute(
        "SELECT count(*) FROM lab_requests"
        " WHERE user_id = %s AND created_at > now() - interval '1 hour'",
        (user_id,),
    )
    (mine,) = await cursor.fetchone() or (0,)
    if mine >= PER_USER_PER_HOUR:
        return "You've made a lot of creatures! Try again in an hour."

    # Everyone's requests take turns for the daily count, for the same reason.
    await conn.execute("SELECT pg_advisory_xact_lock(%s)", (DAILY_LOCK,))
    cursor = await conn.execute(
        "SELECT count(*) FROM lab_requests WHERE created_at > now() - interval '1 day'"
    )
    (everyone,) = await cursor.fetchone() or (0,)
    if everyone >= PER_DAY:
        return "The creature lab is closed for today. Come back tomorrow!"

    await conn.execute("INSERT INTO lab_requests (user_id) VALUES (%s)", (user_id,))
    return None
