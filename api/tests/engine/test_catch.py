import pytest

from app.engine.catch import capture_chance, catch_rate, shake_checks
from app.engine.types import Pokemon
from tests.engine.helpers import ScriptedRng, make_creature


def with_total(total: float, legendary: bool = False) -> Pokemon:
    each = total / 6
    return make_creature(
        attack=each, defense=each, hp=each, isLegendary=legendary,
        specialAttack=each, specialDefense=each, speed=each,
    )  # fmt: skip


def test_catch_rate_runs_from_255_to_30() -> None:
    assert catch_rate(with_total(300)) == 255
    assert catch_rate(with_total(240)) == 255
    assert catch_rate(with_total(1070)) == 30
    assert catch_rate(with_total(1200)) == 30
    assert catch_rate(with_total(684)) == 142


def test_catch_rate_halves_for_legendaries() -> None:
    assert catch_rate(with_total(1070, legendary=True)) == 15


def test_capture_chance() -> None:
    assert capture_chance(255, 90, 90) == pytest.approx(1 / 3)
    assert capture_chance(255, 0, 90) == 1
    assert capture_chance(30, 0, 90) == pytest.approx(30 / 255)


def test_shake_checks() -> None:
    assert shake_checks(1, ScriptedRng(0.99, 0.99, 0.99, 0.99)) == 4
    assert shake_checks(0, ScriptedRng(0)) == 0
    # p = 1/16 → each check passes at 0.5.
    assert shake_checks(1 / 16, ScriptedRng(0.4, 0.4, 0.6)) == 2
