"""Starting the API must not talk to Google: a client that hangs or fails while
being created would stop every route from starting, not only the lab."""

import pytest
from google import genai
from google.cloud import storage

from app.config import Settings
from app.main import create_app
from tests.conftest import TEST_JWT_SECRET


def refuse(*_: object, **__: object) -> None:
    raise AssertionError("a Google client was created at startup")


def test_building_the_app_creates_no_google_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "Client", refuse)
    monkeypatch.setattr(genai, "Client", refuse)
    settings = Settings(
        "postgresql://unused",
        TEST_JWT_SECRET,
        google_cloud_project="a-project",
        creature_bucket="a-bucket",
    )
    app = create_app(settings)
    assert app.state.lab is not None
