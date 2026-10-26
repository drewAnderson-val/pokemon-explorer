import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    run_migrations: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=_require("DATABASE_URL"),
            jwt_secret=_require("JWT_SECRET"),
            run_migrations=os.environ.get("RUN_MIGRATIONS", "true").lower() != "false",
        )


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable {name}")
    return value
