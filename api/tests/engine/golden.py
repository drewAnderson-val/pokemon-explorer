"""Loads the scripted battles recorded by src/lib/battle/golden.test.ts."""

import json
from pathlib import Path
from typing import Any

GOLDEN = Path(__file__).parents[1] / "golden" / "battles.json"
POKEMON_JSON = Path(__file__).parents[3] / "src" / "data" / "pokemon.json"


def scenarios() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(GOLDEN.read_text())
    return data


def pokemon_by_id() -> dict[int, Any]:
    return {p["id"]: p for p in json.loads(POKEMON_JSON.read_text())}


def assert_same_json(actual: Any, expected: Any, where: str = "$") -> None:
    """Equality that also requires the same number type. Python says 24 == 24.0,
    but the frontend would receive "24.0" where the TS engine sends 24."""
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected and type(actual) is type(expected), (
            f"{where}: {actual!r} != {expected!r}"
        )
    elif isinstance(expected, int | float):
        assert type(actual) is type(expected) and actual == expected, (
            f"{where}: {actual!r} ({type(actual).__name__}) != {expected!r} "
            f"({type(expected).__name__})"
        )
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), (
            f"{where}: list {actual!r} != {expected!r}"
        )
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_same_json(a, e, f"{where}[{i}]")
    elif isinstance(expected, dict):
        assert isinstance(actual, dict), f"{where}: {actual!r} is not an object"
        assert set(actual) == set(expected), f"{where}: keys {sorted(actual)} != {sorted(expected)}"
        for key in expected:
            assert_same_json(actual[key], expected[key], f"{where}.{key}")
    else:
        raise TypeError(f"{where}: unexpected {type(expected).__name__}")
