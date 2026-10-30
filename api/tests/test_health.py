import time

import psycopg
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_reports_ok_when_database_answers(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_503_when_database_is_down() -> None:
    app = create_app(
        Settings("postgresql://postgres:x@localhost:1/none", "unused", run_migrations=False)
    )
    with TestClient(app) as client:
        started = time.monotonic()
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "database unavailable"}
    assert time.monotonic() - started < 3


def test_startup_runs_migrations(test_database_url: str, reset_db: None) -> None:
    app = create_app(Settings(test_database_url, "unused"))
    with TestClient(app):
        pass

    with psycopg.connect(test_database_url) as conn:
        names = conn.execute("SELECT name FROM schema_migrations ORDER BY name").fetchall()
    assert names == [
        ("0001_pokemon.sql",),
        ("0002_seed_pokemon.sql",),
        ("0003_users.sql",),
        ("0004_teams_and_wild_battles.sql",),
        ("0005_matches.sql",),
        ("0006_creatures.sql",),
        ("0007_catalog_images.sql",),
    ]
