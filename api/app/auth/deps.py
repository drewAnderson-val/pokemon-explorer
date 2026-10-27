"""current_user: the one check every protected route depends on."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
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


async def current_user(
    request: Request, conn: Annotated[AsyncConnection, Depends(get_conn)]
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
