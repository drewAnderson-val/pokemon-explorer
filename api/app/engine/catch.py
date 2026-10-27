"""Catching (src/lib/battle/catch.ts)."""

import math

from app.engine.stats import total_stats
from app.engine.types import Pokemon, Rng

WEAKEST = 300
STRONGEST = 1070
EASIEST = 255
HARDEST = 30
MIN_RATE = 3


def capture_chance(rate: float, hp: int, max_hp: int) -> float:
    """Gen III+: a = (3·max − 2·hp) · rate / (3·max), caught with chance a / 255."""
    return min(1, ((3 * max_hp - 2 * hp) * rate) / (3 * max_hp) / 255)


def catch_rate(creature: Pokemon) -> int:
    """Stronger creatures are harder to catch (255 for the commonest, 3 minimum)."""
    total = min(STRONGEST, max(WEAKEST, total_stats(creature)))
    rate = EASIEST - ((total - WEAKEST) * (EASIEST - HARDEST)) / (STRONGEST - WEAKEST)
    return max(MIN_RATE, math.floor(rate / 2 if creature.get("isLegendary") else rate))


def shake_checks(chance: float, rng: Rng) -> int:
    """Four checks that all pass with chance `chance`; how many passed (4 = caught)."""
    per_shake = chance**0.25
    passed = 0
    while passed < 4 and rng() < per_shake:
        passed += 1
    return passed
