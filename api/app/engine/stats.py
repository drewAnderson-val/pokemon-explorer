"""Stat and XP formulas (src/lib/battle/stats.ts): the games' formulas without IVs,
EVs or natures."""

import math

from app.engine.types import Pokemon, Stats

START_LEVEL = 5
MAX_LEVEL = 100


def total_stats(p: Pokemon) -> int:
    return (
        p["hp"] + p["attack"] + p["defense"] + p["specialAttack"] + p["specialDefense"] + p["speed"]
    )


def stat_at(base: float, level: int) -> int:
    return math.floor((2 * base * level) / 100) + 5


def max_hp_at(base: float, level: int) -> int:
    return math.floor((2 * base * level) / 100) + level + 10


def stats_at(creature: Pokemon, level: int) -> Stats:
    return {
        "attack": stat_at(creature["attack"], level),
        "defense": stat_at(creature["defense"], level),
        "specialAttack": stat_at(creature["specialAttack"], level),
        "specialDefense": stat_at(creature["specialDefense"], level),
        "speed": stat_at(creature["speed"], level),
    }


def xp_for_level(level: int) -> int:
    """Medium-fast growth: level n needs n³ total XP."""
    return level**3


def level_for_xp(xp: int) -> int:
    level = 1
    while level < MAX_LEVEL and xp_for_level(level + 1) <= xp:
        level += 1
    return level


def xp_gain(defeated: Pokemon, defeated_level: int) -> int:
    """A quarter of the total base stats stands in for the games' base XP."""
    return math.floor((math.floor(total_stats(defeated) / 4) * defeated_level) / 7)


def xp_progress(level: int, xp: int) -> float:
    """0–1 through the current level, for the XP bar."""
    if level >= MAX_LEVEL:
        return 1
    start = xp_for_level(level)
    span = xp_for_level(level + 1) - start
    return min(1, max(0, (xp - start) / span))
