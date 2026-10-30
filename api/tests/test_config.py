import pytest

from app.config import Settings


def test_from_env_strips_trailing_newlines(monkeypatch: pytest.MonkeyPatch) -> None:
    # Secret Manager keeps a pasted or piped newline, which would end up in the URL.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@/pokemon\n")
    monkeypatch.setenv("JWT_SECRET", "s" * 32 + "\n")

    settings = Settings.from_env()

    assert settings.database_url == "postgresql://u:p@/pokemon"
    assert settings.jwt_secret == "s" * 32


def test_from_env_names_the_missing_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("JWT_SECRET", "s" * 32)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings.from_env()


def test_short_jwt_secret_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    # HS256 needs at least 32 bytes of key; a short one is guessable offline.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("JWT_SECRET", "too-short")
    with pytest.raises(RuntimeError, match="32"):
        Settings.from_env()


def test_the_lab_reads_its_project_bucket_and_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "proj\n")
    monkeypatch.setenv("CREATURE_BUCKET", "proj-creature-images")
    monkeypatch.delenv("IMAGE_MODEL", raising=False)
    settings = Settings.from_env()
    assert (settings.google_cloud_project, settings.creature_bucket) == (
        "proj",
        "proj-creature-images",
    )
    assert settings.image_model == "gemini-3.1-flash-lite-image"


def test_without_a_bucket_the_lab_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    monkeypatch.delenv("CREATURE_BUCKET", raising=False)
    settings = Settings.from_env()
    assert (settings.google_cloud_project, settings.creature_bucket) == (None, None)
