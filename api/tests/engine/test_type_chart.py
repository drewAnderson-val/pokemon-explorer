from collections import Counter

import pytest

from app.engine.type_chart import POKEMON_TYPES, effectiveness, type_multiplier


def test_has_the_standard_number_of_matchups() -> None:
    pairs = [(a, d) for a in POKEMON_TYPES for d in POKEMON_TYPES]
    counts = Counter(type_multiplier(a, d) for a, d in pairs)
    assert counts == {0: 8, 0.5: 61, 1: 18 * 18 - 8 - 61 - 51, 2: 51}


@pytest.mark.parametrize(
    ("attack", "defend"),
    [
        ("Normal", "Ghost"), ("Fighting", "Ghost"), ("Poison", "Steel"), ("Ground", "Flying"),
        ("Electric", "Ground"), ("Psychic", "Dark"), ("Ghost", "Normal"), ("Dragon", "Fairy"),
    ],
)  # fmt: skip
def test_does_nothing(attack: str, defend: str) -> None:
    assert type_multiplier(attack, defend) == 0


@pytest.mark.parametrize(
    ("attack", "defend", "expected"),
    [
        ("Water", "Fire", 2), ("Fire", "Water", 0.5), ("Fairy", "Dragon", 2),
        ("Steel", "Fairy", 2), ("Bug", "Fairy", 0.5), ("Ice", "Dragon", 2),
        ("Grass", "Steel", 0.5), ("Normal", "Fire", 1), ("Dark", "Ghost", 2),
        ("Ghost", "Dark", 0.5),
    ],
)  # fmt: skip
def test_multiplier(attack: str, defend: str, expected: float) -> None:
    assert type_multiplier(attack, defend) == expected


def test_effectiveness_multiplies_both_defender_types() -> None:
    assert effectiveness("Fire", ["Grass", "Steel"]) == 4
    assert effectiveness("Fire", ["Water", "Dragon"]) == 0.25
    assert effectiveness("Ice", ["Fire", "Dragon"]) == 1
    assert effectiveness("Electric", ["Water", "Ground"]) == 0


def test_effectiveness_is_an_int_when_whole() -> None:
    # JSON from the TS engine prints 1, not 1.0; 0.5 × 2 must come out as 1.
    assert type(effectiveness("Ice", ["Fire", "Dragon"])) is int


def test_single_type_and_unknown_names() -> None:
    assert effectiveness("Water", ["Fire"]) == 2
    assert effectiveness("Water", ["Fire", "Mystery"]) == 2
    assert effectiveness("Water", []) == 1
