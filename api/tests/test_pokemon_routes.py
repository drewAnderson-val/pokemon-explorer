import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

GOLDEN: list[dict[str, Any]] = json.loads(
    (Path(__file__).parent / "golden" / "pokemon_queries.json").read_text()
)
POKEMON: list[dict[str, Any]] = json.loads(
    (Path(__file__).parents[2] / "src" / "data" / "pokemon.json").read_text()
)


def case_id(case: dict[str, Any]) -> str:
    return "&".join(f"{k}={v[:12]}" for k, v in case["query"].items()) or "defaults"


@pytest.mark.parametrize("case", GOLDEN, ids=case_id)
def test_matches_express(client: TestClient, case: dict[str, Any]) -> None:
    response = client.get("/api/pokemon", params=case["query"])
    assert response.status_code == case["status"]
    assert response.json() == case["body"]


def test_backslash_is_literal(client: TestClient) -> None:
    response = client.get("/api/pokemon", params={"search": "\\"})
    assert response.json()["pagination"]["total"] == 0


def test_repeated_search_is_400(client: TestClient) -> None:
    response = client.get("/api/pokemon?search=a&search=b")
    assert response.status_code == 400
    assert response.json() == {"error": "search must be a single string"}


def test_one_by_id(client: TestClient) -> None:
    assert client.get("/api/pokemon/1").json() == POKEMON[0]


def test_legendary_flag_only_where_the_source_has_it(client: TestClient) -> None:
    legendary = next(p for p in POKEMON if "isLegendary" in p)
    assert client.get(f"/api/pokemon/{legendary['id']}").json() == legendary


def test_unknown_id_is_404(client: TestClient) -> None:
    response = client.get("/api/pokemon/5000")
    assert response.status_code == 404
    assert response.json() == {"error": "No creature #5000"}


def test_non_numeric_id_is_400(client: TestClient) -> None:
    response = client.get("/api/pokemon/abc")
    assert response.status_code == 400
    assert "error" in response.json()
