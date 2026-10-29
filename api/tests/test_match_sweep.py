"""The sweep: away after 5 s without a stream, forfeit after 60 s, expiry. Time is
moved by rewriting timestamps in the past with SQL."""

import asyncio
from typing import Any

import psycopg
from fastapi.testclient import TestClient

from app.matches.sweep import sweep
from tests.accounts import sign_up


def started_match(
    client: TestClient, names: tuple[str, str] = ("host", "guest")
) -> tuple[str, dict[str, str], dict[str, str]]:
    host, guest = sign_up(client, names[0]), sign_up(client, names[1])
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    for h, ids in ((host, [1]), (guest, [2])):
        client.post(
            f"/api/matches/{match_id}/actions",
            json={"action": {"type": "team", "creatureIds": ids}},
            headers=h,
        )
    return match_id, host, guest


def sql(url: str, query: str, *args: Any) -> None:
    with psycopg.connect(url) as conn:
        conn.execute(query, args)


def view(client: TestClient, h: dict[str, str], match_id: str) -> Any:
    return client.get(f"/api/matches/{match_id}", headers=h).json()


async def run_sweep(url: str) -> list[str]:
    async with await psycopg.AsyncConnection.connect(url, autocommit=True) as conn:
        return await sweep(conn)


def connected(url: str, match_id: str) -> None:
    """Both seats have a live stream right now."""
    sql(
        url,
        "UPDATE matches SET host_away = false, guest_away = false, host_left_at = NULL,"
        " guest_left_at = NULL, host_stream = 'a', guest_stream = 'b',"
        " host_seen_at = now(), guest_seen_at = now() WHERE id = %s",
        match_id,
    )


def test_away_after_5_seconds_without_a_stream(client: TestClient, test_database_url: str) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    sql(
        test_database_url,
        "UPDATE matches SET guest_left_at = now() - interval '3 s' WHERE id = %s",
        match_id,
    )
    assert asyncio.run(run_sweep(test_database_url)) == []
    assert view(client, host, match_id)["opponent"]["connected"] is True
    sql(
        test_database_url,
        "UPDATE matches SET guest_left_at = now() - interval '6 s' WHERE id = %s",
        match_id,
    )
    assert asyncio.run(run_sweep(test_database_url)) == [match_id]
    assert view(client, host, match_id)["opponent"]["connected"] is False


def test_forfeit_after_60_seconds_gone(client: TestClient, test_database_url: str) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    sql(
        test_database_url,
        "UPDATE matches SET started_at = now() - interval '5 min',"
        " guest_left_at = now() - interval '61 s' WHERE id = %s",
        match_id,
    )
    asyncio.run(run_sweep(test_database_url))
    assert view(client, host, match_id)["outcome"] == {"reason": "left", "winner": "you"}


def test_the_60_seconds_count_from_the_battle_start(
    client: TestClient, test_database_url: str
) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    # Dropped long ago, but the battle only started 30 s ago: not yet.
    sql(
        test_database_url,
        "UPDATE matches SET started_at = now() - interval '30 s',"
        " guest_left_at = now() - interval '10 min' WHERE id = %s",
        match_id,
    )
    asyncio.run(run_sweep(test_database_url))
    assert view(client, host, match_id)["outcome"] is None


def test_a_crashed_instance_still_counts_as_gone(
    client: TestClient, test_database_url: str
) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    # Its stream never closed (the instance died): only the heartbeat stopped.
    sql(
        test_database_url,
        "UPDATE matches SET started_at = now() - interval '5 min',"
        " guest_seen_at = now() - interval '70 s' WHERE id = %s",
        match_id,
    )
    asyncio.run(run_sweep(test_database_url))
    assert view(client, host, match_id)["outcome"] == {"reason": "left", "winner": "you"}


def test_unstarted_and_finished_matches_expire(client: TestClient, test_database_url: str) -> None:
    host = sign_up(client, "host")
    old = client.post("/api/matches", headers=host).json()["matchId"]
    fresh = client.post("/api/matches", headers=host).json()["matchId"]
    sql(
        test_database_url,
        "UPDATE matches SET created_at = now() - interval '31 min' WHERE id = %s",
        old,
    )
    match_id, _, guest = started_match(client, ("host2", "guest2"))
    sql(
        test_database_url,
        'UPDATE matches SET outcome = \'{"reason": "forfeit", "winner": "host"}\','
        " finished_at = now() - interval '11 min' WHERE id = %s",
        match_id,
    )
    asyncio.run(run_sweep(test_database_url))
    # (The old one may already be gone: every match route sweeps first.)
    assert client.get(f"/api/matches/{fresh}", headers=host).status_code == 200
    assert client.get(f"/api/matches/{old}", headers=host).status_code == 404
    assert client.get(f"/api/matches/{match_id}", headers=guest).status_code == 404


def test_two_sweeps_at_once_forfeit_once(client: TestClient, test_database_url: str) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    sql(
        test_database_url,
        "UPDATE matches SET started_at = now() - interval '5 min',"
        " guest_left_at = now() - interval '61 s', guest_away = true WHERE id = %s",
        match_id,
    )
    # Already away, so the forfeit is the only change left. Otherwise one sweep can
    # mark the seat away while the other forfeits it, and both report the match.

    async def both() -> list[list[str]]:
        return list(
            await asyncio.gather(run_sweep(test_database_url), run_sweep(test_database_url))
        )

    results = asyncio.run(both())
    assert sorted(len(r) for r in results) == [0, 1]
    assert view(client, host, match_id)["outcome"]["reason"] == "left"


def test_routes_sweep_first(client: TestClient, test_database_url: str) -> None:
    match_id, host, _ = started_match(client)
    connected(test_database_url, match_id)
    sql(
        test_database_url,
        "UPDATE matches SET started_at = now() - interval '5 min',"
        " guest_left_at = now() - interval '61 s' WHERE id = %s",
        match_id,
    )
    # No background sweep has run; reading the match sweeps first.
    assert view(client, host, match_id)["outcome"] == {"reason": "left", "winner": "you"}
