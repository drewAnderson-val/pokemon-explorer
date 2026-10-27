"""Battle data as JSON-shaped dicts with the same camelCase keys as the TypeScript
types in src/lib/battle/. What the engine returns is what the database stores and
what the frontend renders, with no conversion layer in between."""

from collections.abc import Callable
from typing import Literal, NotRequired, TypedDict

# A random number 0 ≤ n < 1. Injected everywhere so tests can script every roll.
Rng = Callable[[], float]

Side = Literal["player", "enemy"]
Seat = Literal["host", "guest"]


class Pokemon(TypedDict):
    attack: int
    defense: int
    description: str
    generation: int
    height: float
    hp: int
    id: int
    imageUrl: str
    isLegendary: NotRequired[bool]
    name: str
    specialAttack: int
    specialDefense: int
    speed: int
    types: list[str]
    weight: float


class Move(TypedDict):
    accuracy: int
    name: str
    power: int
    type: str


class Stats(TypedDict):
    attack: int
    defense: int
    specialAttack: int
    specialDefense: int
    speed: int


class Fighter(TypedDict):
    creature: Pokemon
    hp: int
    level: int
    maxHp: int
    moves: list[Move]
    stats: Stats
    # Ties the fighter back to its saved team member (or a fresh wild id).
    uid: str
    xp: int


class BattleState(TypedDict):
    # Index into `party` of the creature on the field.
    active: int
    caught: bool
    enemy: Fighter
    # The active creature fainted and another must be sent out.
    mustSwitch: bool
    party: list[Fighter]
    # Friend match view: no catching, XP or blackout.
    versus: NotRequired[bool]
    winner: Side | None


# Events are plain dicts with a "type" key, exactly as the TS BattleEvent union:
# xp, damage, switch, levelUp, move, catch, faint, miss, blackout.
BattleEvent = dict[str, object]


class TurnResult(TypedDict):
    events: list[BattleEvent]
    state: BattleState


class VersusTeam(TypedDict):
    active: int
    mustSwitch: bool
    party: list[Fighter]


class VersusState(TypedDict):
    guest: VersusTeam
    host: VersusTeam
    winner: Seat | None


class VersusTurnResult(TypedDict):
    events: list[BattleEvent]
    state: VersusState
