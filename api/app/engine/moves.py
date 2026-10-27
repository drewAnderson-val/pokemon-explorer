"""Moves (src/lib/battle/moves.ts). The catalog has no moves, so each type gets a
small original set: a reliable one and a stronger, less accurate one. Normal has
four so a pure Normal creature still gets four different moves."""

from typing import Literal

from app.engine.type_chart import CHART
from app.engine.types import Move

# Physical types hit with attack vs defense; the rest use the special pair.
PHYSICAL_TYPES = frozenset(
    {"Bug", "Fighting", "Ghost", "Ground", "Normal", "Poison", "Rock", "Steel"}
)

# type → (name, power, accuracy)
MOVES_BY_TYPE: dict[str, tuple[tuple[str, int, int], ...]] = {
    "Bug": (
        ("Swarm Nip", 50, 100),
        ("Carapace Ram", 80, 90),
    ),
    "Dark": (
        ("Sly Swipe", 55, 100),
        ("Night Lunge", 80, 90),
    ),
    "Dragon": (
        ("Scale Rush", 60, 100),
        ("Wyrm Roar", 90, 85),
    ),
    "Electric": (
        ("Static Snap", 45, 100),
        ("Volt Crash", 85, 90),
    ),
    "Fairy": (
        ("Glimmer", 50, 100),
        ("Moonbeam Burst", 85, 90),
    ),
    "Fighting": (
        ("Palm Strike", 50, 100),
        ("Rising Knee", 85, 85),
    ),
    "Fire": (
        ("Cinder Flick", 45, 100),
        ("Blaze Burst", 85, 90),
    ),
    "Flying": (
        ("Gust Slice", 50, 100),
        ("Sky Dive", 85, 90),
    ),
    "Ghost": (
        ("Shade Tap", 50, 100),
        ("Phantom Grip", 80, 90),
    ),
    "Grass": (
        ("Leaf Flick", 45, 100),
        ("Bramble Lash", 85, 90),
    ),
    "Ground": (
        ("Mud Toss", 50, 100),
        ("Quake Stomp", 90, 85),
    ),
    "Ice": (
        ("Frost Nip", 45, 100),
        ("Glacier Spear", 85, 90),
    ),
    "Normal": (
        ("Quick Tackle", 40, 100),
        ("Body Check", 60, 95),
        ("Wild Swing", 75, 90),
        ("Heavy Slam", 90, 85),
    ),
    "Poison": (
        ("Toxic Jab", 50, 100),
        ("Venom Wave", 80, 90),
    ),
    "Psychic": (
        ("Mind Poke", 50, 100),
        ("Psi Storm", 90, 85),
    ),
    "Rock": (
        ("Pebble Shot", 50, 95),
        ("Boulder Drop", 85, 85),
    ),
    "Steel": (
        ("Iron Tap", 50, 100),
        ("Alloy Smash", 85, 90),
    ),
    "Water": (
        ("Splash Jet", 45, 100),
        ("Tidal Crash", 85, 90),
    ),
}


def move_category(type_: str) -> Literal["physical", "special"]:
    return "physical" if type_ in PHYSICAL_TYPES else "special"


def to_move(type_: str, spec: tuple[str, int, int]) -> Move:
    name, power, accuracy = spec
    return {"accuracy": accuracy, "name": name, "power": power, "type": type_}


def moves_for(types: list[str]) -> list[Move]:
    """Four moves from the creature's types: both moves of its main type, one of its
    second type (Normal if it has none) and a Normal move. Deterministic, so a
    creature always knows the same moves."""
    known = [t for t in types if t in CHART]
    main = known[0] if known else "Normal"
    second = known[1] if len(known) > 1 else None
    chosen = [to_move(main, spec) for spec in MOVES_BY_TYPE[main][:2]]
    if second and second != "Normal":
        chosen.append(to_move(second, MOVES_BY_TYPE[second][0]))
    # Top up with Normal moves not already taken (a Normal main type used the first two).
    for spec in MOVES_BY_TYPE["Normal"]:
        if len(chosen) == 4:
            break
        if not any(taken["name"] == spec[0] for taken in chosen):
            chosen.append(to_move("Normal", spec))
    return chosen
