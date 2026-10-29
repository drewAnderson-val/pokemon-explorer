"""The interactive docs (Swagger UI at /api/docs) must be usable: every route
described, defaults and examples filled in, and an Authorize button for routes
that need a token."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

PUBLIC = {
    ("get", "/api/health"),
    ("get", "/api/pokemon"),
    ("get", "/api/pokemon/{pokemon_id}"),
    ("post", "/api/auth/signup"),
    ("post", "/api/auth/login"),
    # EventSource can't send headers: the stream checks a ?token= itself.
    ("get", "/api/matches/{match_id}/events"),
}


@pytest.fixture
def spec(client: TestClient) -> dict[str, Any]:
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    data: dict[str, Any] = response.json()
    return data


def operations(spec: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (method, path, op) for path, item in spec["paths"].items() for method, op in item.items()
    ]


def test_docs_live_under_api(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200
    assert "swagger" in client.get("/api/docs").text.lower()
    assert client.get("/docs").status_code == 404


def test_every_route_has_a_summary(spec: dict[str, Any]) -> None:
    missing = [f"{m} {p}" for m, p, op in operations(spec) if not op.get("summary")]
    assert missing == []


def test_protected_routes_need_the_bearer_token(spec: dict[str, Any]) -> None:
    schemes = spec["components"]["securitySchemes"]
    assert any(s["type"] == "http" and s["scheme"] == "bearer" for s in schemes.values())
    for method, path, op in operations(spec):
        needs_token = bool(op.get("security"))
        assert needs_token == ((method, path) not in PUBLIC), f"{method} {path}"


def test_pokemon_list_documents_its_parameters_and_defaults(spec: dict[str, Any]) -> None:
    params = {p["name"]: p for p in spec["paths"]["/api/pokemon"]["get"]["parameters"]}
    assert set(params) == {"page", "limit", "search", "sort", "type"}
    assert params["page"]["schema"]["default"] == 1
    assert params["limit"]["schema"]["default"] == 20
    assert params["limit"]["schema"]["maximum"] == 100
    assert params["sort"]["schema"]["enum"] == ["id", "total", "speed"]
    assert len(params["type"]["schema"]["enum"]) == 18


def test_every_request_body_has_an_example(spec: dict[str, Any]) -> None:
    for method, path, op in operations(spec):
        body = op.get("requestBody")
        if not body:
            continue
        content = body["content"]["application/json"]
        schema = content.get("schema", {})
        ref = schema.get("$ref", "")
        resolved = spec["components"]["schemas"][ref.split("/")[-1]] if ref else schema
        has_example = "examples" in content or "example" in content or "examples" in resolved
        assert has_example, f"{method} {path}"


def test_battle_actions_are_documented_one_by_one(spec: dict[str, Any]) -> None:
    content = spec["paths"]["/api/battles/wild/actions"]["post"]["requestBody"]["content"]
    examples = content["application/json"]["examples"]
    assert {"move", "switch", "catch", "sendOut"} <= set(examples)


def test_error_responses_are_documented(spec: dict[str, Any]) -> None:
    put = spec["paths"]["/api/team"]["put"]["responses"]
    assert {"200", "400", "401"} <= set(put)
    turn = spec["paths"]["/api/battles/wild/actions"]["post"]["responses"]
    assert {"200", "400", "401", "404", "409"} <= set(turn)


def test_the_documented_example_move_really_works(client: TestClient, spec: dict[str, Any]) -> None:
    from tests.accounts import sign_up

    h = sign_up(client)
    client.put("/api/team", json={"members": [{"creatureId": 1}]}, headers=h)
    client.post("/api/battles/wild", headers=h)
    examples = spec["paths"]["/api/battles/wild/actions"]["post"]["requestBody"]["content"][
        "application/json"
    ]["examples"]
    response = client.post("/api/battles/wild/actions", json=examples["move"]["value"], headers=h)
    assert response.status_code == 200, response.text
