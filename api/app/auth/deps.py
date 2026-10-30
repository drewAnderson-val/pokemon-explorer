"""current_user: the one check every protected route depends on."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import AsyncConnection

from app.auth.tokens import InvalidToken, read_token
from app.auth.users import User, find_user
from app.db.pool import get_conn

UNAUTHORIZED = HTTPException(
    status_code=401,
    detail="Sign in to continue",
    # Tells the client which kind of credentials this API expects.
    headers={"WWW-Authenticate": "Bearer"},
)


# Declares the Bearer scheme so the docs show an Authorize button and mark these
# routes as needing a token. auto_error=False: the header is still read below, so
# a missing or malformed one gets this API's own 401 message.
bearer = HTTPBearer(auto_error=False, description="The token from signup or login")


async def current_user(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _documented: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token or " " in token:
        raise UNAUTHORIZED
    try:
        user_id = read_token(token, request.app.state.settings.jwt_secret)
    except InvalidToken:
        raise UNAUTHORIZED from None
    # The token can outlive its account; checking the database catches that.
    user = await find_user(conn, user_id)
    if user is None:
        raise UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def optional_user(
    request: Request,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _documented: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User | None:
    """No token: nobody. A token: the same check as current_user, so a bad or
    expired one is still a 401 (the browser then signs out)."""
    if "Authorization" not in request.headers:
        return None
    return await current_user(request, conn)


OptionalUser = Annotated[User | None, Depends(optional_user)]


async def current_user_released(
    request: Request,
    _documented: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> User:
    """current_user for a route that waits on something slow (the lab's drawing):
    it borrows a connection only for the check and gives it back, where
    current_user's stays checked out until the response is sent."""
    async with request.app.state.pool.connection() as conn:
        return await current_user(request, conn)


ReleasedUser = Annotated[User, Depends(current_user_released)]
