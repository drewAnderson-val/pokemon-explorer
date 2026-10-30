import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    run_migrations: bool = True
    # Browser origins allowed to call the API (CORS). None: no CORS headers at all.
    cors_origin_regex: str | None = None
    # The Creature Lab draws with Vertex AI in this project and stores images in
    # this bucket. Either missing: the lab answers 503 (local dev, tests).
    google_cloud_project: str | None = None
    creature_bucket: str | None = None
    image_model: str = "gemini-3.1-flash-lite-image"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=_require("DATABASE_URL"),
            jwt_secret=_jwt_secret(),
            run_migrations=os.environ.get("RUN_MIGRATIONS", "true").lower() != "false",
            cors_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", "").strip() or None,
            google_cloud_project=os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip() or None,
            creature_bucket=os.environ.get("CREATURE_BUCKET", "").strip() or None,
            image_model=os.environ.get("IMAGE_MODEL", "").strip() or "gemini-3.1-flash-lite-image",
        )


def _require(name: str) -> str:
    # Strip: a value pasted or piped into Secret Manager keeps its trailing newline.
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable {name}")
    return value


# HS256 signs with HMAC-SHA256; a key shorter than its 32-byte output is weaker
# than the algorithm and can be brute-forced offline from any one token.
MIN_JWT_SECRET_BYTES = 32


def _jwt_secret() -> str:
    secret = _require("JWT_SECRET")
    if len(secret.encode()) < MIN_JWT_SECRET_BYTES:
        raise RuntimeError(f"JWT_SECRET must be at least {MIN_JWT_SECRET_BYTES} bytes")
    return secret
