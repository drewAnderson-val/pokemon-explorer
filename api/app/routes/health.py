from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from psycopg import Error as DatabaseError
from psycopg_pool import AsyncConnectionPool, PoolTimeout

router = APIRouter()

# Below Cloud Run's probe budget, so a dead database answers 503 instead of hanging.
DB_TIMEOUT_SECONDS = 2.0


@router.get("/api/health")
async def health(request: Request) -> JSONResponse:
    pool: AsyncConnectionPool = request.app.state.pool
    try:
        async with pool.connection(timeout=DB_TIMEOUT_SECONDS) as conn:
            await conn.execute("SELECT 1")
    except (DatabaseError, PoolTimeout):
        return JSONResponse({"status": "database unavailable"}, status_code=503)
    return JSONResponse({"status": "ok"})
