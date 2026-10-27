import pytest

from app.engine.stats import (
    level_for_xp,
    max_hp_at,
    stat_at,
    stats_at,
    xp_for_level,
    xp_gain,
    xp_progress,
)
from tests.engine.helpers import make_creature


def test_level_50_is_base_plus_5_and_hp_plus_60() -> None:
    assert stat_at(100, 50) == 105
    assert max_hp_at(100, 50) == 160


def test_scale_with_level() -> None:
    assert stat_at(100, 5) == 15
    assert max_hp_at(100, 5) == 25
    assert stats_at(make_creature(speed=200), 100)["speed"] == 405


def test_needs_n_cubed_xp() -> None:
    assert xp_for_level(5) == 125
    assert level_for_xp(0) == 1
    assert level_for_xp(215) == 5
    assert level_for_xp(216) == 6
    assert level_for_xp(10**9) == 100


def test_xp_gain() -> None:
    # Total 600 → base 150; 150 × 5 / 7 = 107.
    assert xp_gain(make_creature(), 5) == 107


def test_xp_progress() -> None:
    assert xp_progress(5, 125) == 0
    assert xp_progress(5, 170) == pytest.approx(45 / 91)
    assert xp_progress(100, 10**6) == 1
