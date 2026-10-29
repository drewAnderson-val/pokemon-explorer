"""Live match views over server-sent events, including across two app instances
(two `create_app`s on one database), which is how Cloud Run runs more than one."""

import json
import time
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.accounts import sign_up
from tests.conftest import TEST_JWT_SECRET


def instance(url: str) -> Any:
    app = create_app(Settings(url, TEST_JWT_SECRET))
    # Pings every 0.2 s so a test reading the stream never waits long for a line.
    app.state.sse_ping_seconds = 0.2
    return app


@pytest.fixture
def two(test_database_url: str, reset_db: None) -> Iterator[tuple[TestClient, TestClient]]:
    with TestClient(instance(test_database_url)) as a, TestClient(instance(test_database_url)) as b:
        yield a, b


def token(h: dict[str, str]) -> str:
    return h["Authorization"].removeprefix("Bearer ")


class Events:
    """Reads named server-sent events from a streaming response, with a deadline."""

    def __init__(self, response: Any) -> None:
        self.lines = response.iter_lines()

    def next(self, timeout: float = 5) -> tuple[str, Any]:
        deadline = time.monotonic() + timeout
        name, data = None, None
        for line in self.lines:
            if time.monotonic() > deadline:
                break
            if line.startswith("event: "):
                name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                data = json.loads(line.removeprefix("data: "))
            elif line == "" and name:
                return name, data
        raise AssertionError("no event before the deadline")


def setup_match(client: TestClient) -> tuple[str, dict[str, str], dict[str, str]]:
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    return match_id, host, guest


def stream(client: TestClient, match_id: str, h: dict[str, str] | str) -> Any:
    t = h if isinstance(h, str) else token(h)
    return client.stream("GET", f"/api/matches/{match_id}/events?token={t}")


def test_a_player_gets_their_view_then_each_change(two: tuple[TestClient, TestClient]) -> None:
    a, _ = two
    match_id, host, guest = setup_match(a)
    with stream(a, match_id, host) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        events = Events(response)
        name, view = events.next()
        assert (name, view["phase"], view["you"]) == ("view", "picking", "host")
        a.post(
            f"/api/matches/{match_id}/actions",
            json={"action": {"type": "team", "creatureIds": [1]}},
            headers=guest,
        )
        name, view = events.next()
        assert (name, view["opponent"]["ready"]) == ("view", True)


def test_a_change_on_one_instance_reaches_a_stream_on_the_other(
    two: tuple[TestClient, TestClient],
) -> None:
    a, b = two
    match_id, host, guest = setup_match(a)
    with stream(b, match_id, host) as response:
        events = Events(response)
        events.next()  # the current view
        # The guest's action is handled by instance A; the host's stream is on B.
        a.post(
            f"/api/matches/{match_id}/actions",
            json={"action": {"type": "team", "creatureIds": [1]}},
            headers=guest,
        )
        name, view = events.next(timeout=2)
        assert (name, view["opponent"]["ready"]) == ("view", True)


@pytest.mark.parametrize("who", ["garbage", "expired", "stranger"])
def test_anyone_but_a_player_gets_no_view(two: tuple[TestClient, TestClient], who: str) -> None:
    from datetime import UTC, datetime, timedelta
    from uuid import uuid4

    from app.auth.tokens import issue_token

    a, _ = two
    match_id, _, _ = setup_match(a)
    tokens = {
        "garbage": "not.a.token",
        "expired": issue_token(
            uuid4(), TEST_JWT_SECRET, now=datetime.now(UTC) - timedelta(hours=2)
        )[0],
        "stranger": token(sign_up(a, "stranger")),
    }
    with stream(a, match_id, tokens[who]) as response:
        assert response.status_code == 200
        # A bad or expired token is told apart from "no such match", so the
        # client knows to sign in again rather than give up on the match.
        expected = "gone" if who == "stranger" else "unauthorized"
        assert Events(response).next()[0] == expected


def test_the_opponent_sees_you_connect(two: tuple[TestClient, TestClient]) -> None:
    a, _ = two
    match_id, host, guest = setup_match(a)
    with stream(a, match_id, host) as host_response:
        host_events = Events(host_response)
        assert host_events.next()[1]["opponent"]["connected"] is False
        with stream(a, match_id, guest):
            name, view = host_events.next()
            assert (name, view["opponent"]["connected"]) == ("view", True)


def test_a_newer_stream_replaces_the_older_one_even_on_another_instance(
    two: tuple[TestClient, TestClient],
) -> None:
    a, b = two
    match_id, host, _ = setup_match(a)
    with stream(a, match_id, host) as first:
        older = Events(first)
        older.next()
        with stream(b, match_id, host) as second:
            Events(second).next()
            assert older.next()[0] == "replaced"
