import asyncio

import psycopg

from app.matches.live import LiveMatches


async def test_one_failed_push_doesnt_stop_the_listener(
    test_database_url: str, reset_db: None
) -> None:
    live = LiveMatches()
    pushed: list[str] = []

    async def push(match_id: str) -> None:
        if match_id == "boom":
            raise RuntimeError("a busy pool, a database blip")
        pushed.append(match_id)

    live.push = push  # type: ignore[method-assign]
    task = asyncio.create_task(live._listen(test_database_url))
    try:
        async with await psycopg.AsyncConnection.connect(
            test_database_url, autocommit=True
        ) as conn:
            await asyncio.sleep(0.3)  # let it LISTEN
            await conn.execute("SELECT pg_notify('match_events', 'boom')")
            await conn.execute("SELECT pg_notify('match_events', 'after')")
        for _ in range(30):
            if pushed:
                break
            await asyncio.sleep(0.1)
        assert pushed == ["after"]
    finally:
        task.cancel()


async def test_reconnecting_catches_up_every_local_match(
    test_database_url: str, reset_db: None
) -> None:
    live = LiveMatches()
    pushed: list[str] = []

    async def push(match_id: str) -> None:
        pushed.append(match_id)

    live.push = push  # type: ignore[method-assign]
    live.streams["abcdefgh"] = set()
    task = asyncio.create_task(live._listen(test_database_url))
    try:
        for _ in range(30):
            if pushed:
                break
            await asyncio.sleep(0.1)
        # Nothing was announced: after LISTEN, it pushed what it was holding anyway.
        assert pushed == ["abcdefgh"]
    finally:
        task.cancel()
