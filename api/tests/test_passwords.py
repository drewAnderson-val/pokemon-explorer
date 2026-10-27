import psycopg
import pytest

from app.auth.passwords import hash_password, verify_password
from app.db.migrate import migrate


def test_hash_is_not_the_password_and_verifies() -> None:
    hashed = hash_password("correct horse")
    assert "correct horse" not in hashed
    assert verify_password(hashed, "correct horse") is True
    assert verify_password(hashed, "wrong horse") is False


def test_same_password_hashes_differently() -> None:
    # A random salt per hash: equal passwords don't give equal hashes.
    assert hash_password("pw12345678") != hash_password("pw12345678")


def test_uses_argon2id_with_fixed_parameters() -> None:
    assert hash_password("pw12345678").startswith("$argon2id$v=19$m=19456,t=2,p=1$")


async def test_usernames_are_unique_ignoring_case(conn: psycopg.AsyncConnection) -> None:
    await migrate(conn)
    await conn.execute("INSERT INTO users (username, password_hash) VALUES ('Drew', 'x')")
    with pytest.raises(psycopg.errors.UniqueViolation):
        await conn.execute("INSERT INTO users (username, password_hash) VALUES ('drew', 'x')")
