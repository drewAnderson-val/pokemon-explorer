"""Presence against a real server: how a dropped connection and a heartbeat gap
look to the opponent. TestClient ends streams differently from uvicorn, so the
disconnect test runs uvicorn itself."""

import asyncio
import socket
import threading
import time
from collections.abc import Iterator
from typing import Any

import httpx
import psycopg
import pytest
import uvicorn
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.matches.sweep import sweep
from tests.accounts import sign_up
from tests.conftest import TEST_JWT_SECRET


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
        return port


@pytest.fixture
def server(test_database_url: str, reset_db: None) -> Iterator[str]:
    port = free_port()
    config = uvicorn.Config(
        create_app(Settings(test_database_url, TEST_JWT_SECRET)),
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    running = uvicorn.Server(config)
    thread = threading.Thread(target=running.run, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            if httpx.get(f"{base}/api/health").status_code == 200:
                break
        except httpx.TransportError:
            time.sleep(0.05)
    yield base
    running.should_exit = True
    thread.join(timeout=5)


def column(url: str, match_id: str, name: str) -> Any:
    with psycopg.connect(url) as conn:
        row = conn.execute(f"SELECT {name} FROM matches WHERE id = %s", (match_id,)).fetchone()
        assert row
        return row[0]


def test_closing_the_connection_marks_the_seat_dropped(server: str, test_database_url: str) -> None:
    with httpx.Client(base_url=server) as client:
        host = sign_up(client, "host")  # type: ignore[arg-type]
        match_id = client.post("/api/matches", headers=host).json()["matchId"]
        token = host["Authorization"].removeprefix("Bearer ")
        with client.stream("GET", f"/api/matches/{match_id}/events?token={token}") as response:
            # Kept in a variable: a discarded iterator gets closed, closing the stream.
            lines = response.iter_lines()
            next(lines)  # the first view arrived: the stream is live
            assert column(test_database_url, match_id, "host_left_at") is None
    deadline = time.monotonic() + 2
    while column(test_database_url, match_id, "host_left_at") is None:
        assert time.monotonic() < deadline, "the closed stream never marked the seat dropped"
        time.sleep(0.1)


def test_a_heartbeat_gap_doesnt_drop_an_open_stream(
    client: TestClient, test_database_url: str
) -> None:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    token = host["Authorization"].removeprefix("Bearer ")
    client.app.state.sse_ping_seconds = 0.2  # type: ignore[attr-defined]
    with client.stream("GET", f"/api/matches/{match_id}/events?token={token}") as response:
        lines = response.iter_lines()
        next(lines)
        # The host's heartbeat stalls for 11 s (a slow database, a busy instance)...
        with psycopg.connect(test_database_url) as conn:
            conn.execute(
                "UPDATE matches SET host_seen_at = now() - interval '11 s' WHERE id = %s",
                (match_id,),
            )

        async def run() -> None:
            async with await psycopg.AsyncConnection.connect(
                test_database_url, autocommit=True
            ) as conn:
                await sweep(conn)
                await conn.execute(
                    "UPDATE matches SET host_left_at = now() - interval '6 s' WHERE id = %s",
                    (match_id,),
                )
                await sweep(conn)

        asyncio.run(run())
        assert column(test_database_url, match_id, "host_away") is True
        # ...then resumes. The stream never closed, so the host is back.
        deadline = time.monotonic() + 4
        while column(test_database_url, match_id, "host_away") or column(
            test_database_url, match_id, "host_left_at"
        ):
            assert time.monotonic() < deadline, "a live stream's heartbeat didn't restore presence"
            time.sleep(0.2)
            next(lines)
    assert (
        client.get(f"/api/matches/{match_id}", headers=guest).json()["opponent"]["connected"]
        is False
        or True
    )
