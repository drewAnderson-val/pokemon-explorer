from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest

from app.auth.tokens import InvalidToken, issue_token, read_token

SECRET = "test-secret-that-is-long-enough-for-hs256"
NOW = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)


def test_round_trip() -> None:
    user_id = uuid4()
    token, expires = issue_token(user_id, SECRET, now=NOW)
    assert expires == NOW + timedelta(hours=1)
    # A token from the past is expired, so read a fresh one.
    fresh, _ = issue_token(user_id, SECRET)
    assert read_token(fresh, SECRET) == user_id


def test_payload_holds_only_who_and_when() -> None:
    user_id = uuid4()
    token, _ = issue_token(user_id, SECRET, now=NOW)
    # Anyone can read a JWT's payload: it's signed, not encrypted.
    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload == {
        "sub": str(user_id),
        "iat": int(NOW.timestamp()),
        "exp": int((NOW + timedelta(hours=1)).timestamp()),
    }


def test_expired_token_is_rejected() -> None:
    token, _ = issue_token(uuid4(), SECRET, now=datetime.now(UTC) - timedelta(hours=2))
    with pytest.raises(InvalidToken):
        read_token(token, SECRET)


def test_wrong_secret_is_rejected() -> None:
    token, _ = issue_token(uuid4(), SECRET)
    with pytest.raises(InvalidToken):
        read_token(token, "another-secret-that-is-long-enough-too")


def test_tampered_payload_is_rejected() -> None:
    mine, _ = issue_token(uuid4(), SECRET)
    theirs, _ = issue_token(uuid4(), SECRET)
    header, _, signature = mine.split(".")
    forged = ".".join([header, theirs.split(".")[1], signature])
    with pytest.raises(InvalidToken):
        read_token(forged, SECRET)


def test_alg_none_is_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    forged = jwt.encode({"sub": str(uuid4()), "iat": now, "exp": now + 60}, None, algorithm="none")
    with pytest.raises(InvalidToken):
        read_token(forged, SECRET)


def test_missing_sub_is_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    token = jwt.encode({"iat": now, "exp": now + 60}, SECRET, algorithm="HS256")
    with pytest.raises(InvalidToken):
        read_token(token, SECRET)


def test_sub_that_is_not_a_uuid_is_rejected() -> None:
    now = int(datetime.now(UTC).timestamp())
    token = jwt.encode({"sub": "admin", "iat": now, "exp": now + 60}, SECRET, algorithm="HS256")
    with pytest.raises(InvalidToken):
        read_token(token, SECRET)


@pytest.mark.parametrize("garbage", ["", "not.a.token", "abc"])
def test_garbage_is_rejected(garbage: str) -> None:
    with pytest.raises(InvalidToken):
        read_token(garbage, SECRET)
