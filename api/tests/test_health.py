import time

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
