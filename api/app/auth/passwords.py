"""Password hashing with argon2id.

argon2 is deliberately slow and memory-hungry, so a stolen hash is expensive to
guess against. The parameters are OWASP's recommended minimum (19 MiB, 2 passes,
1 lane) rather than the library's default 64 MiB: a burst of logins on a 512 MiB
Cloud Run instance must not run it out of memory. They're stored inside each hash,
so changing them later doesn't break existing passwords.
"""

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerificationError:
        return False


# Login checks unknown usernames against this, so they take as long to reject as a
# wrong password; otherwise the response time would reveal which usernames exist.
DUMMY_HASH = hash_password("not a real password")
