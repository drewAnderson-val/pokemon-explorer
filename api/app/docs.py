"""What the interactive docs (Swagger UI at /api/docs) show beyond the code
itself: the error shape every route uses, and request examples to try."""

from typing import Any

from pydantic import BaseModel

from app.pokemon.params import MAX_LIMIT, MAX_SEARCH_LENGTH, PAGE_SIZE, POKEMON_TYPES, SORT_KEYS


class ErrorBody(BaseModel):
    """Every error from this API: a message written for people."""

    error: str


_WHY = {
    400: "Bad input: the message says what's wrong",
    401: "No token, or an expired or invalid one: sign in again",
    404: "Not found",
    409: "Valid, but not now: the message says why",
    503: "The database is unavailable",
}


def errors(*codes: int) -> dict[int | str, dict[str, Any]]:
    """`responses=` entries for these error codes, all with the {"error"} shape."""
    return {code: {"model": ErrorBody, "description": _WHY[code]} for code in codes}


# /api/pokemon reads its query string by hand (so a repeated parameter is a 400,
# not silently the last value), which hides the parameters from FastAPI. They're
# described here instead; parsing is unchanged.
POKEMON_QUERY_PARAMETERS: list[dict[str, Any]] = [
    {
        "name": "page",
        "in": "query",
        "description": "Page number. Past the last page is an empty page, not an error.",
        "schema": {"type": "integer", "minimum": 1, "default": 1},
    },
    {
        "name": "limit",
        "in": "query",
        "description": "Results per page.",
        "schema": {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT, "default": PAGE_SIZE},
    },
    {
        "name": "search",
        "in": "query",
        "description": (
            "Case-insensitive text in the name, a type or the description, matched "
            "literally (% and _ are not wildcards)."
        ),
        "schema": {"type": "string", "maxLength": MAX_SEARCH_LENGTH, "default": ""},
    },
    {
        "name": "sort",
        "in": "query",
        "description": "id ascending, or total stats / speed descending (ties by id).",
        "schema": {"type": "string", "enum": list(SORT_KEYS), "default": "id"},
    },
    {
        "name": "type",
        "in": "query",
        "description": "Only creatures with this type (any case).",
        "schema": {"type": "string", "enum": list(POKEMON_TYPES)},
    },
]

# The body of POST /api/battles/wild/actions, one shape per kind of action.
_ACTION_SCHEMAS: dict[str, dict[str, Any]] = {
    "move": {
        "properties": {
            "type": {"const": "move"},
            "index": {
                "type": "integer",
                "minimum": 0,
                "maximum": 3,
                "description": "Which move (0–3)",
            },
            "timing": {
                "type": "number",
                "minimum": 1,
                "maximum": 1.25,
                "default": 1,
                "description": "Timing-bar bonus; anything else is clamped to 1–1.25",
            },
        },
        "required": ["type", "index"],
    },
    "switch": {
        "properties": {"type": {"const": "switch"}, "to": {"type": "integer", "minimum": 0}},
        "required": ["type", "to"],
    },
    "catch": {"properties": {"type": {"const": "catch"}}, "required": ["type"]},
    "sendOut": {
        "properties": {"type": {"const": "sendOut"}, "to": {"type": "integer", "minimum": 0}},
        "required": ["type", "to"],
    },
}

WILD_ACTION_BODY: dict[str, Any] = {
    "required": True,
    "content": {
        "application/json": {
            "schema": {
                "type": "object",
                "required": ["turn", "action"],
                "properties": {
                    "turn": {
                        "type": "integer",
                        "minimum": 0,
                        "description": "The battle's current turn (from the last response)",
                    },
                    "action": {
                        "oneOf": [
                            {"type": "object", "title": name, **schema}
                            for name, schema in _ACTION_SCHEMAS.items()
                        ]
                    },
                },
            },
            "examples": {
                "move": {
                    "summary": "Use move 0 with a good timing bar",
                    "value": {"turn": 0, "action": {"type": "move", "index": 0, "timing": 1.1}},
                },
                "switch": {
                    "summary": "Swap to the creature in slot 1",
                    "value": {"turn": 0, "action": {"type": "switch", "to": 1}},
                },
                "catch": {
                    "summary": "Throw a ball",
                    "value": {"turn": 0, "action": {"type": "catch"}},
                },
                "sendOut": {
                    "summary": "After a faint: send out slot 1",
                    "value": {"turn": 0, "action": {"type": "sendOut", "to": 1}},
                },
            },
        }
    },
}
