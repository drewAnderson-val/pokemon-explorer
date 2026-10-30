import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from app.auth.deps import CurrentUser
from app.auth.guests import PREFIX as GUEST_PREFIX
from app.auth.guests import create_guest
from app.auth.passwords import DUMMY_HASH, hash_password, verify_password
from app.auth.tokens import issue_token
from app.auth.users import User, UsernameTaken, create_user, find_login
from app.db.pool import get_conn
from app.docs import errors

router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]

USERNAME = re.compile(r"[A-Za-z0-9_]{3,20}")
# The upper bound keeps a megabyte "password" from costing a megabyte of hashing.
PASSWORD_LENGTH = range(8, 129)


class Credentials(BaseModel):
    username: str
    password: str

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"username": "ash_k", "password": "pikachu-rules"}]}
    )


def valid(credentials: Credentials) -> bool:
    """Whether these could belong to an account: the same rules signup enforces."""
    return bool(USERNAME.fullmatch(credentials.username)) and (
        len(credentials.password) in PASSWORD_LENGTH
    )


def session(request: Request, user: User, status_code: int = 200) -> JSONResponse:
    token, expires = issue_token(user.id, request.app.state.settings.jwt_secret)
    body: dict[str, Any] = {
        "token": token,
        "expiresAt": int(expires.timestamp()),
        "user": {"id": str(user.id), "username": user.username},
    }
    return JSONResponse(body, status_code=status_code)


def error(message: str, status_code: int) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code)


@router.post(
    "/api/auth/signup",
    summary="Create an account; returns a 1-hour token",
    status_code=201,
    responses=errors(400, 409),
)
async def signup(credentials: Credentials, request: Request, conn: Conn) -> JSONResponse:
    if not USERNAME.fullmatch(credentials.username):
        return error("username must be 3-20 letters, digits or underscores", 400)
    if credentials.username.lower().startswith(GUEST_PREFIX):
        return error("Names starting with guest_ are for guests", 400)
    if len(credentials.password) not in PASSWORD_LENGTH:
        return error("password must be 8-128 characters", 400)

    # argon2 takes tens of milliseconds of CPU. In the thread pool, other requests
    # keep being served meanwhile; on the event loop, they'd all wait.
    password_hash = await run_in_threadpool(hash_password, credentials.password)
    try:
        user = await create_user(conn, credentials.username, password_hash)
    except UsernameTaken:
        return error("That username is taken", 409)
    return session(request, user, status_code=201)


@router.post(
    "/api/auth/guest",
    summary="Play as guest: a throwaway account; returns a 1-hour token",
    description="No password: when the token expires, the guest is over. Deleted after a day.",
    status_code=201,
    responses=errors(429),
)
async def guest(request: Request, conn: Conn) -> JSONResponse:
    user = await create_guest(conn)
    if user is None:
        return error("Lots of guests right now. Try again soon, or create an account.", 429)
    return session(request, user, status_code=201)


@router.post(
    "/api/auth/login",
    summary="Sign in; returns a 1-hour token",
    responses=errors(400, 401),
)
async def login(credentials: Credentials, request: Request, conn: Conn) -> JSONResponse:
    if not valid(credentials):
        # No account can match. Still one verify (of a short fixed password, never the
        # submitted one, which could be megabytes) so this answer takes as long as any
        # other failed login. Also keeps a NUL byte away from Postgres, which rejects it.
        await run_in_threadpool(verify_password, DUMMY_HASH, "not-a-real-password")
        return error("Wrong username or password", 401)

    found = await find_login(conn, credentials.username)
    # An unknown username is checked against a dummy hash, so it takes as long as
    # a wrong password and gets the same answer: neither reveals who has an account.
    password_hash = found[1] if found else DUMMY_HASH
    matches = await run_in_threadpool(verify_password, password_hash, credentials.password)
    if found is None or not matches:
        return error("Wrong username or password", 401)
    return session(request, found[0])


@router.get("/api/me", summary="The signed-in account", responses=errors(401))
async def me(user: CurrentUser) -> dict[str, str]:
    return {"id": str(user.id), "username": user.username}
