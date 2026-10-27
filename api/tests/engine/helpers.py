from typing import Any

from app.engine.types import Pokemon


def make_creature(**overrides: Any) -> Pokemon:
    """Like src/test/battle.ts makeCreature: 100 in every stat, a Normal type."""
    creature: dict[str, Any] = {
        "attack": 100,
        "defense": 100,
        "description": "A test creature.",
        "generation": 1,
        "height": 1,
        "hp": 100,
        "id": 1,
        "imageUrl": "",
        "name": "Testmon",
        "specialAttack": 100,
        "specialDefense": 100,
        "speed": 100,
        "types": ["Normal"],
        "weight": 10,
    }
    creature.update(overrides)
    return creature  # type: ignore[return-value]


class ScriptedRng:
    """Returns the given numbers in order and counts the calls; running out is a bug."""

    def __init__(self, *values: float) -> None:
        self.values = list(values)
        self.calls = 0

    def __call__(self) -> float:
        if self.calls >= len(self.values):
            raise AssertionError(f"rng called {self.calls + 1} times, scripted {len(self.values)}")
        value = self.values[self.calls]
        self.calls += 1
        return value
