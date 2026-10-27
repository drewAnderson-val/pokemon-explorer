"""Access tokens: JWTs signed with HS256 (an HMAC using the server's secret).

A token is three base64 parts, header.payload.signature. Anyone can read the
payload; only someone with the secret can produce a signature that matches it,
so a valid signature proves the server issued exactly this payload.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

TOKEN_LIFETIME = timedelta(hours=1)
ALGORITHM = "HS256"


class InvalidToken(Exception):
    """Missing, malformed, expired, forged or signed with another key."""


def issue_token(user_id: UUID, secret: str, now: datetime | None = None) -> tuple[str, datetime]:
    issued = (now or datetime.now(UTC)).replace(microsecond=0)
    expires = issued + TOKEN_LIFETIME
    payload = {"sub": str(user_id), "iat": issued, "exp": expires}
    return jwt.encode(payload, secret, algorithm=ALGORITHM), expires


def read_token(token: str, secret: str) -> UUID:
    try:
        payload = jwt.decode(
            token,
            secret,
            # Pinned: never trust the algorithm named in the token's own header,
            # or a forged token could say "none" and skip the signature.
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
        return UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError) as error:
        raise InvalidToken from error
