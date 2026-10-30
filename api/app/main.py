import asyncio
import contextlib
import random
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from app.auth.guests import delete_expired_guests
from app.config import Settings
from app.db.migrate import migrate
from app.db.pool import open_pool
from app.lab.images import vertex_generator
from app.lab.storage import bucket_store
from app.matches.live import LiveMatches
from app.matches.sweep import sweep
from app.routes import auth, creatures, health, matches, pokemon, team, wild
from app.routes.creatures import Lab


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
        await app.state.live.start(settings.database_url, pool)
        sweeper = asyncio.create_task(sweep_forever(pool))
        yield
        sweeper.cancel()
        await app.state.live.stop()
        await pool.close()

    app = FastAPI(
        title="Pokemon Explorer API",
        version="1.0",
        description=(
            "The catalog, accounts, teams and server-played wild battles behind "
            "Pokemon Explorer. Sign up or log in, then press **Authorize** and paste "
            "the token to try the routes that need an account."
        ),
        # Under /api, like every route, so the dev proxy and Cloud Run serve them.
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    # Every random roll in battles. Tests replace it with scripted numbers.
    app.state.rng = random.random
    app.state.live = LiveMatches()
    # The Creature Lab needs Vertex AI and the image bucket; without both it
    # answers 503 (local dev and tests, which put in fakes).
    app.state.lab = (
        Lab(
            generator=vertex_generator(settings.google_cloud_project, settings.image_model),
            store=bucket_store(settings.creature_bucket),
        )
        if settings.google_cloud_project and settings.creature_bucket
        else None
    )
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
    app.include_router(auth.router)
    app.include_router(team.router)
    app.include_router(wild.router)
    app.include_router(matches.router)
    app.include_router(creatures.router)

    # Errors routes raise (like current_user's 401) come out as {"error": ...}. Routing
    # errors (unknown path, wrong method) are raised by Starlette and keep {"detail"}.
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


SWEEP_SECONDS = 5


async def sweep_forever(pool: AsyncConnectionPool) -> None:
    """Runs the match sweep every few seconds while this instance is up. Cloud Run can
    scale to zero, so routes also sweep first; this covers matches nobody is asking
    about (a player who left while the other just waits)."""
    while True:
        await asyncio.sleep(SWEEP_SECONDS)
        with contextlib.suppress(Exception):
            async with pool.connection() as conn:
                await sweep(conn)
                await delete_expired_guests(conn)
