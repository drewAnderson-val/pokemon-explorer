"""POST, GET and DELETE /api/creatures, with a fake image model and bucket."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import anyio
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg_pool import AsyncConnectionPool

from app import main
from app.config import Settings
from app.lab.images import GeneratedImage, ImageBlocked, ImageBusy
from app.routes import creatures
from app.routes.creatures import Lab
from tests.accounts import sign_up
from tests.conftest import TEST_JWT_SECRET

PNG = b"\x89PNG fake"
BODY = {"name": "Embercub", "types": ["Fire"], "description": "a tiny dragon"}


class FakeGenerator:
    def __init__(self) -> None:
        self.prompts: list[str] = []
        self.fail: Exception | None = None
        # Set by a test to hold the image call until it says go.
        self.release: threading.Event | None = None

    async def __call__(self, prompt: str) -> GeneratedImage:
        self.prompts.append(prompt)
        while self.release is not None and not self.release.is_set():
            await anyio.sleep(0.01)
        if self.fail:
            raise self.fail
        return GeneratedImage(data=PNG, mime_type="image/png")


class FakeStore:
    def __init__(self) -> None:
        self.saved: list[bytes] = []
        self.deleted: list[str] = []
        self.fail = False

    async def save(self, data: bytes, mime_type: str) -> str:
        if self.fail:
            raise OSError("bucket down")
        self.saved.append(data)
        return f"https://img.test/creatures/{len(self.saved)}.png"

    async def delete(self, url: str) -> None:
        self.deleted.append(url)


def lab(client: TestClient) -> tuple[FakeGenerator, FakeStore]:
    generator, store = FakeGenerator(), FakeStore()
    client.app.state.lab = Lab(generator=generator, store=store)  # type: ignore[attr-defined]
    return generator, store


def create(client: TestClient, h: dict[str, str], body: Any = BODY) -> Any:
    return client.post("/api/creatures", json=body, headers=h)


def sql(url: str, query: str, *args: Any) -> list[Any]:
    with psycopg.connect(url) as conn:
        cursor = conn.execute(query, args)
        return cursor.fetchall() if cursor.description else []


def used_slots(url: str, username: str, count: int, hours_ago: float = 0) -> None:
    sql(
        url,
        "INSERT INTO lab_requests (user_id, created_at)"
        " SELECT u.id, now() - make_interval(secs => %s)"
        " FROM users u, generate_series(1, %s) WHERE u.username = %s",
        hours_ago * 3600,
        count,
        username,
    )


# --- making one ---


def test_signed_out_is_401(client: TestClient) -> None:
    lab(client)
    assert create(client, {}).status_code == 401
    assert client.get("/api/creatures").status_code == 401
    assert client.delete("/api/creatures/1001").status_code == 401


def test_makes_a_creature_and_stores_it(client: TestClient, test_database_url: str) -> None:
    generator, store = lab(client)
    h = sign_up(client, "maker")
    response = create(client, h)
    assert response.status_code == 201
    creature = response.json()["creature"]
    assert creature["id"] == 1001
    assert (creature["name"], creature["types"], creature["description"]) == (
        "Embercub",
        ["Fire"],
        "a tiny dragon",
    )
    assert creature["imageUrl"] == "https://img.test/creatures/1.png"
    assert store.saved == [PNG]
    assert 'Name: "Embercub".' in generator.prompts[0]
    owner = sql(
        test_database_url,
        "SELECT u.username FROM pokemon p JOIN users u ON u.id = p.owner_id WHERE p.id = 1001",
    )
    assert owner == [("maker",)]
    # Stored as served: the by-id route returns the same record.
    assert client.get("/api/pokemon/1001", headers=h).json() == creature


def test_a_bad_request_is_400_with_the_reason(client: TestClient) -> None:
    lab(client)
    h = sign_up(client)
    response = create(client, h, {"name": "A", "types": ["Lava"]})
    assert (response.status_code, response.json()) == (400, {"error": "unknown type: Lava"})
    response = client.post(
        "/api/creatures", content=b"not json", headers={**h, "content-type": "application/json"}
    )
    assert (response.status_code, response.json()) == (400, {"error": "body must be a JSON object"})


def test_a_huge_request_is_413(client: TestClient) -> None:
    lab(client)
    h = sign_up(client)
    response = create(client, h, {**BODY, "description": "x" * 5000})
    assert response.status_code == 413


def test_not_configured_is_503(client: TestClient) -> None:
    client.app.state.lab = None  # type: ignore[attr-defined]
    response = create(client, sign_up(client))
    assert (response.status_code, response.json()) == (
        503,
        {"error": "The creature lab is not configured here."},
    )


def test_a_blocked_image_is_422(client: TestClient) -> None:
    generator, _ = lab(client)
    generator.fail = ImageBlocked("blocked")
    response = create(client, sign_up(client))
    assert (response.status_code, response.json()) == (
        422,
        {"error": "That creature couldn't be drawn. Try a different idea."},
    )


def test_a_busy_model_is_503_with_retry_after(client: TestClient) -> None:
    generator, _ = lab(client)
    generator.fail = ImageBusy("429")
    response = create(client, sign_up(client))
    assert response.status_code == 503
    assert response.headers["retry-after"] == "60"
    assert response.json() == {"error": "The lab is busy right now. Try again in a minute."}


def test_a_failed_drawing_or_upload_is_502_and_stores_nothing(
    client: TestClient, test_database_url: str
) -> None:
    generator, store = lab(client)
    h = sign_up(client)
    generator.fail = RuntimeError("model fell over")
    jammed = {"error": "The drawing machine jammed. Try again."}
    response = create(client, h)
    assert (response.status_code, response.json()) == (502, jammed)
    generator.fail = None
    store.fail = True
    response = create(client, h)
    assert (response.status_code, response.json()) == (502, jammed)
    assert sql(test_database_url, "SELECT count(*) FROM pokemon WHERE owner_id IS NOT NULL") == [
        (0,)
    ]


# --- limits ---


def test_five_an_hour_each(client: TestClient, test_database_url: str) -> None:
    lab(client)
    h = sign_up(client, "maker")
    used_slots(test_database_url, "maker", 4)
    used_slots(test_database_url, "maker", 10, hours_ago=1.1)  # older than an hour
    assert create(client, h).status_code == 201
    response = create(client, h)
    assert (response.status_code, response.json()) == (
        429,
        {"error": "You've made a lot of creatures! Try again in an hour."},
    )
    # Someone else still can.
    assert create(client, sign_up(client, "other")).status_code == 201


def test_a_blocked_image_still_counts(client: TestClient, test_database_url: str) -> None:
    generator, _ = lab(client)
    h = sign_up(client, "maker")
    generator.fail = ImageBlocked("blocked")
    for _ in range(5):
        assert create(client, h).status_code == 422
    generator.fail = None
    assert create(client, h).status_code == 429


def test_a_hundred_a_day_overall(client: TestClient, test_database_url: str) -> None:
    lab(client)
    sign_up(client, "busy")
    used_slots(test_database_url, "busy", 100, hours_ago=2)
    response = create(client, sign_up(client, "late"))
    assert (response.status_code, response.json()) == (
        429,
        {"error": "The creature lab is closed for today. Come back tomorrow!"},
    )


def test_two_racing_requests_take_one_last_slot(client: TestClient, test_database_url: str) -> None:
    lab(client)
    h = sign_up(client, "maker")
    used_slots(test_database_url, "maker", 4)
    with ThreadPoolExecutor(2) as pool:
        codes = sorted(pool.map(lambda _: create(client, h).status_code, range(2)))
    assert codes == [201, 429]


def test_the_image_call_holds_no_lock(client: TestClient) -> None:
    generator, _ = lab(client)
    h = sign_up(client, "maker")
    generator.release = threading.Event()
    with ThreadPoolExecutor(2) as pool:
        making = pool.submit(create, client, h)
        try:
            while not generator.prompts:  # the lab is drawing
                time.sleep(0.01)
            # The same user edits their team meanwhile. With a lock held through the
            # drawing, this would wait until the drawing finished (here: forever).
            team = pool.submit(
                client.put, "/api/team", json={"members": [{"creatureId": 1}]}, headers=h
            )
            assert team.result(timeout=2).status_code == 200
        finally:
            generator.release.set()
        assert making.result().status_code == 201


# --- listing and deleting ---


def test_lists_your_creatures_newest_first(client: TestClient) -> None:
    lab(client)
    h = sign_up(client, "maker")
    for name in ("One", "Two"):
        assert create(client, h, {**BODY, "name": name}).status_code == 201
    create(client, sign_up(client, "other"), {**BODY, "name": "Theirs"})
    names = [c["name"] for c in client.get("/api/creatures", headers=h).json()["data"]]
    assert names == ["Two", "One"]


def test_deleting_removes_it_from_the_team_and_the_bucket(client: TestClient) -> None:
    _, store = lab(client)
    h = sign_up(client, "maker")
    made = create(client, h).json()["creature"]
    client.put(
        "/api/team", json={"members": [{"creatureId": 1}, {"creatureId": made["id"]}]}, headers=h
    )
    assert client.delete(f"/api/creatures/{made['id']}", headers=h).status_code == 204
    assert client.get(f"/api/pokemon/{made['id']}", headers=h).status_code == 404
    team = client.get("/api/team", headers=h).json()["members"]
    assert [m["creatureId"] for m in team] == [1]
    assert store.deleted == [made["imageUrl"]]


def test_someone_elses_or_a_catalog_creature_is_404(client: TestClient) -> None:
    lab(client)
    made = create(client, sign_up(client, "maker")).json()["creature"]
    stranger = sign_up(client, "stranger")
    for id_ in (made["id"], 1, 999999):
        response = client.delete(f"/api/creatures/{id_}", headers=stranger)
        assert (response.status_code, response.json()) == (404, {"error": f"No creature #{id_}"})


def test_a_creature_locked_into_a_running_match_cant_be_deleted(
    client: TestClient, test_database_url: str
) -> None:
    lab(client)
    host, guest = sign_up(client, "host"), sign_up(client, "guest")
    made = create(client, host).json()["creature"]
    match_id = client.post("/api/matches", headers=host).json()["matchId"]
    client.post(f"/api/matches/{match_id}/join", headers=guest)
    lock = {"action": {"type": "team", "creatureIds": [made["id"]]}}
    assert (
        client.post(f"/api/matches/{match_id}/actions", json=lock, headers=host).status_code == 204
    )
    response = client.delete(f"/api/creatures/{made['id']}", headers=host)
    assert (response.status_code, response.json()) == (
        409,
        {"error": "That creature is in a friend match"},
    )
    # Once the match is over, it can go.
    sql(
        test_database_url,
        'UPDATE matches SET outcome = \'{"reason": "forfeit", "winner": "guest"}\','
        " finished_at = now() WHERE id = %s",
        match_id,
    )
    assert client.delete(f"/api/creatures/{made['id']}", headers=host).status_code == 204


# --- the drawing holds nothing and gives up ---


def test_a_hung_drawing_is_503_within_the_timeout(client: TestClient) -> None:
    generator, store = FakeGenerator(), FakeStore()
    generator.release = threading.Event()  # never set: the drawing hangs
    client.app.state.lab = Lab(generator=generator, store=store, timeout=0.2)  # type: ignore[attr-defined]
    started = time.monotonic()
    response = create(client, sign_up(client))
    assert (response.status_code, response.json()) == (
        503,
        {"error": "The lab is busy right now. Try again in a minute."},
    )
    assert time.monotonic() - started < 2
    assert store.saved == []


def test_the_drawing_holds_no_database_connection(
    test_database_url: str, reset_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    # One connection in the pool: if the drawing kept it, nothing else could run.
    monkeypatch.setattr(
        main,
        "open_pool",
        lambda url: AsyncConnectionPool(
            url, min_size=1, max_size=1, kwargs={"autocommit": True}, open=False, timeout=2
        ),
    )
    app = main.create_app(Settings(test_database_url, TEST_JWT_SECRET))
    with TestClient(app) as one_conn:
        generator, _ = lab(one_conn)
        generator.release = threading.Event()
        h = sign_up(one_conn, "maker")
        with ThreadPoolExecutor(2) as pool:
            making = pool.submit(create, one_conn, h)
            try:
                while not generator.prompts:
                    time.sleep(0.01)
                browsing = pool.submit(one_conn.get, "/api/pokemon?limit=1")
                assert browsing.result(timeout=5).status_code == 200
            finally:
                generator.release.set()
            assert making.result().status_code == 201


def test_a_declared_body_over_4kb_is_413_before_reading(client: TestClient) -> None:
    lab(client)
    h = sign_up(client)
    response = client.post(
        "/api/creatures",
        content=b'{"name": "A", "types": ["Fire"]}',
        headers={**h, "content-type": "application/json", "content-length": "1000000"},
    )
    assert response.status_code == 413


def test_a_failed_save_deletes_the_uploaded_image(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, store = lab(client)
    real_roll = creatures.roll_creature  # type: ignore[attr-defined]
    # hp NULL breaks the insert's NOT NULL constraint after the upload.
    monkeypatch.setattr(creatures, "roll_creature", lambda *a: {**real_roll(*a), "hp": None})
    response = create(client, sign_up(client))
    assert (response.status_code, response.json()) == (
        502,
        {"error": "The drawing machine jammed. Try again."},
    )
    assert store.deleted == ["https://img.test/creatures/1.png"]
