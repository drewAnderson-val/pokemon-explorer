"""Live match views, across instances.

Every instance keeps one Postgres connection listening on `match_events`. After an
action commits, its route sends NOTIFY with the match id; every instance holding a
stream for that match re-reads the row and pushes each player their own view. The
notification is only a hint: the data always comes from the row, so a missed one
costs nothing a reconnect doesn't fix.
"""

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from app.matches.store import load_match
from app.matches.views import view_for

log = logging.getLogger(__name__)

CHANNEL = "match_events"


def frame(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


GONE = frame("gone", {})
REPLACED = frame("replaced", {})


@dataclass(eq=False)
class Stream:
    match_id: str
    seat: str
    stream_id: str
    # (frame, last): the last frame ends the stream.
    queue: asyncio.Queue[tuple[str, bool]] = field(default_factory=asyncio.Queue)
    last_sent: str = ""

    def send(self, data: str, last: bool = False) -> None:
        # The same view twice (e.g. our own "connected" notification) isn't news.
        if data == self.last_sent and not last:
            return
        self.last_sent = data
        self.queue.put_nowait((data, last))


class LiveMatches:
    def __init__(self) -> None:
        self.streams: dict[str, set[Stream]] = defaultdict(set)
        self.pool: AsyncConnectionPool | None = None
        self.task: asyncio.Task[None] | None = None

    async def start(self, database_url: str, pool: AsyncConnectionPool) -> None:
        self.pool = pool
        self.task = asyncio.create_task(self._listen(database_url))

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task

    def add(self, stream: Stream) -> None:
        self.streams[stream.match_id].add(stream)

    def remove(self, stream: Stream) -> None:
        streams = self.streams.get(stream.match_id)
        if streams is not None:
            streams.discard(stream)
            if not streams:
                del self.streams[stream.match_id]

    async def push(self, match_id: str) -> None:
        """Re-reads the match and gives each local stream for it its own view."""
        streams = list(self.streams.get(match_id, ()))
        if not streams or self.pool is None:
            return
        async with self.pool.connection() as conn:
            match = await load_match(conn, match_id)
        for stream in streams:
            if match is None:
                stream.send(GONE, last=True)
            elif match[f"{stream.seat}_stream"] != stream.stream_id:
                # A newer stream for this seat opened (here or on another instance).
                stream.send(REPLACED, last=True)
            else:
                stream.send(frame("view", view_for(match, stream.seat)))

    async def _listen(self, database_url: str) -> None:
        # Reconnects if the listening connection drops: notifications sent while it
        # was down are lost, and the next one (or a reconnecting client) catches up.
        while True:
            try:
                async with await AsyncConnection.connect(database_url, autocommit=True) as conn:
                    await conn.execute(f"LISTEN {CHANNEL}")
                    async for note in conn.notifies():
                        await self.push(note.payload)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Match listener lost its connection; reconnecting")
                await asyncio.sleep(1)
