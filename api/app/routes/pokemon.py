from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from psycopg import AsyncConnection

from app.db.pool import get_conn
from app.pokemon.params import parse_pokemon_query
from app.pokemon.queries import find_by_id, find_page

router = APIRouter()

Conn = Annotated[AsyncConnection, Depends(get_conn)]


@router.get("/api/pokemon")
async def list_pokemon(request: Request, conn: Conn) -> JSONResponse:
    # Every value per key, so a repeated parameter can be rejected instead of
    # silently taking the last one.
    params = {key: request.query_params.getlist(key) for key in request.query_params}
    query = parse_pokemon_query(params)
    if isinstance(query, str):
        return JSONResponse({"error": query}, status_code=400)
    return JSONResponse(await find_page(conn, query))


@router.get("/api/pokemon/{pokemon_id}")
async def get_pokemon(pokemon_id: int, conn: Conn) -> JSONResponse:
    found = await find_by_id(conn, pokemon_id)
    if found is None:
        return JSONResponse({"error": f"No creature #{pokemon_id}"}, status_code=404)
    return JSONResponse(found)
