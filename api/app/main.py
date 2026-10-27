from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection

from app.config import Settings
from app.db.migrate import migrate
from app.db.pool import open_pool
from app.routes import health, pokemon


def create_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.run_migrations:
            # Before serving: if a migration fails, startup fails and Cloud Run
            # keeps sending traffic to the previous revision.
            async with await AsyncConnection.connect(
                settings.database_url, autocommit=True
            ) as conn:
                await migrate(conn)
        pool = open_pool(settings.database_url)
        await pool.open(wait=False)
        app.state.pool = pool
        yield
        await pool.close()

    app = FastAPI(title="Pokemon Explorer API", lifespan=lifespan)
    app.state.settings = settings
    if settings.cors_origin_regex:
        # The frontend is served from another origin, so browsers only let it read
        # API responses that name its origin in Access-Control-Allow-Origin.
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=settings.cors_origin_regex,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        )
    app.include_router(health.router)
    app.include_router(pokemon.router)

    # Every error is {"error": ...}, including the 401s and 404s FastAPI raises.
    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    # FastAPI answers bad path or body values with 422 and its own shape; this API
    # answers every bad request with 400 {"error": ...}, like the Express one.
    @app.exception_handler(RequestValidationError)
    async def bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        field = ".".join(str(part) for part in first["loc"][1:])
        return JSONResponse({"error": f"{field}: {first['msg']}"}, status_code=400)

    return app
