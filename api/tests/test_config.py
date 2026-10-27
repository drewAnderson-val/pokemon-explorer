import pytest

from app.config import Settings


def test_from_env_strips_trailing_newlines(monkeypatch: pytest.MonkeyPatch) -> None:
    # Secret Manager keeps a pasted or piped newline, which would end up in the URL.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@/pokemon\n")
    monkeypatch.setenv("JWT_SECRET", "secret\n")

    settings = Settings.from_env()

    assert settings.database_url == "postgresql://u:p@/pokemon"
    assert settings.jwt_secret == "secret"


def test_from_env_names_the_missing_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("JWT_SECRET", "secret")

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings.from_env()
