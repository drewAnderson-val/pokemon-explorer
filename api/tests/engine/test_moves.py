from app.engine.moves import moves_for
from app.engine.type_chart import POKEMON_TYPES


def summary(types: list[str]) -> list[str]:
    return [f"{m['type']}:{m['name']}" for m in moves_for(types)]


def test_two_main_one_second_one_normal() -> None:
    assert [m["type"] for m in moves_for(["Fire", "Flying"])] == [
        "Fire",
        "Fire",
        "Flying",
        "Normal",
    ]


def test_falls_back_to_normal_for_a_single_type() -> None:
    assert [m["type"] for m in moves_for(["Water"])] == ["Water", "Water", "Normal", "Normal"]


def test_always_four_different_moves() -> None:
    for types in (["Normal"], ["Normal", "Fire"], ["Fire", "Normal"], ["Ghost", "Dark"]):
        assert len(set(summary(types))) == 4


def test_power_and_accuracy_ranges() -> None:
    for type_ in POKEMON_TYPES:
        for move in moves_for([type_]):
            assert 40 <= move["power"] <= 90
            assert 85 <= move["accuracy"] <= 100


def test_pure_normal_gets_the_four_normal_moves_in_order() -> None:
    assert summary(["Normal"]) == [
        "Normal:Quick Tackle", "Normal:Body Check", "Normal:Wild Swing", "Normal:Heavy Slam",
    ]  # fmt: skip


def test_key_order_matches_the_typescript() -> None:
    # The TS builds moves as {accuracy, name, power, type}; JSON key order follows.
    assert list(moves_for(["Fire"])[0]) == ["accuracy", "name", "power", "type"]
