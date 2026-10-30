"""Ported from server/create.test.ts: the same messages, prompt and rolls."""

from typing import Any

import pytest

from app.lab.request import CreatureRequest, build_prompt, parse_creature_request, roll_creature
from tests.engine.helpers import ScriptedRng


def test_accepts_a_valid_request_and_tidies_the_text() -> None:
    parsed = parse_creature_request(
        {"description": '  a "tiny"\ndragon  ', "name": " Embercub ", "types": ["Fire", "Fire"]}
    )
    assert parsed == CreatureRequest(name="Embercub", types=["Fire"], description="a tiny dragon")


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (None, "body must be a JSON object"),
        ([], "body must be a JSON object"),
        ({"types": ["Fire"]}, "name is required"),
        ({"name": "   ", "types": ["Fire"]}, "name is required"),
        ({"name": "x" * 31, "types": ["Fire"]}, "name must be at most 30 characters"),
        ({"name": "A", "types": []}, "types must list 1 to 2 types"),
        ({"name": "A", "types": ["Fire", "Water", "Ice"]}, "types must list 1 to 2 types"),
        ({"name": "A", "types": "Fire"}, "types must list 1 to 2 types"),
        ({"name": "A", "types": ["Lava"]}, "unknown type: Lava"),
        ({"name": "A", "types": [5]}, "unknown type: 5"),
        ({"description": 5, "name": "A", "types": ["Fire"]}, "description must be a string"),
        (
            {"description": "x" * 201, "name": "A", "types": ["Fire"]},
            "description must be at most 200 characters",
        ),
    ],
)
def test_rejects(body: Any, message: str) -> None:
    assert parse_creature_request(body) == message


def test_the_prompt_quotes_the_user_fields_inside_a_fixed_style() -> None:
    prompt = build_prompt(
        CreatureRequest(name="Embercub", types=["Fire", "Dragon"], description="a tiny dragon")
    )
    assert 'Name: "Embercub".' in prompt
    assert "Type: Fire/Dragon." in prompt
    assert 'Concept: "a tiny dragon".' in prompt
    assert "No text" in prompt


def test_the_prompt_leaves_out_the_concept_without_a_description() -> None:
    assert "Concept" not in build_prompt(CreatureRequest(name="A", types=["Ice"], description=""))


def test_rolls_stats_within_range_and_fills_a_default_description() -> None:
    request = CreatureRequest(name="A", types=["Ice"], description="")
    low = roll_creature(request, "https://img.test/a.png", lambda: 0)
    high = roll_creature(request, "https://img.test/a.png", lambda: 0.999)
    assert (low["attack"], low["height"], low["hp"], low["weight"]) == (20, 0.3, 30, 1)
    assert (high["attack"], high["height"], high["hp"], high["weight"]) == (150, 3, 150, 149.9)
    assert low["description"] == "A newly discovered Ice-type creature."
    assert low["imageUrl"] == "https://img.test/a.png"
    assert (low["generation"], low["isLegendary"], low["name"], low["types"]) == (
        10,
        False,
        "A",
        ["Ice"],
    )
    assert "id" not in low


def test_rolls_draw_in_the_same_order_as_the_express_lab() -> None:
    # The values server/create.ts's rollCreature gives for this sequence.
    rng = ScriptedRng(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
    creature = roll_creature(
        CreatureRequest(name="A", types=["Fire", "Water"], description=""), "u", rng
    )
    assert {k: creature[k] for k in ("attack", "defense", "height", "hp")} == {
        "attack": 33,
        "defense": 46,
        "height": 1.1,
        "hp": 78,
    }
    assert {k: creature[k] for k in ("specialAttack", "specialDefense", "speed", "weight")} == {
        "specialAttack": 85,
        "specialDefense": 98,
        "speed": 111,
        "weight": 120.2,
    }
    assert creature["description"] == "A newly discovered Fire/Water-type creature."
