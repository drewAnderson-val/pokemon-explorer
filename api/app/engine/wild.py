"""Wild battles: a port of src/lib/battle/engine.ts, rule for rule.

Pure rules: no database, no HTTP, no clock. Every random choice goes through the
injected `rng`, in the same order as the TypeScript (per attack: hit, crit, roll),
so scripted tests replay identically in both languages. A turn never changes the
state it's given: it copies first (`_draft`) and returns the new state with the
events that happened, which the client plays back as animations.
"""

import math

from app.engine.catch import capture_chance, catch_rate, shake_checks
from app.engine.moves import move_category, moves_for
from app.engine.stats import (
    MAX_LEVEL,
    START_LEVEL,
    level_for_xp,
    max_hp_at,
    stats_at,
    xp_for_level,
    xp_gain,
)
from app.engine.type_chart import effectiveness
from app.engine.types import (
    BattleEvent,
    BattleState,
    Fighter,
    Move,
    Pokemon,
    Rng,
    Side,
    TurnResult,
)

MAX_TEAM = 6
MIN_ROLL = 0.85
ENEMY_BEST_MOVE_CHANCE = 0.7
CRIT_CHANCE = 1 / 24
CRIT_MULTIPLIER = 1.5
STAB = 1.5
WILD_LEVEL_SPREAD = 2
MIN_WILD_LEVEL = 2

MAX_TIMING = 1.25

# A player action, as the client sends it: {"type": "move", "index", "timing"?},
# {"type": "switch", "to"} or {"type": "catch"}. It comes from the browser, so
# anything else is a ValueError (a 400), never a crash or a different action.
PlayerAction = dict[str, object]


def clamp_timing(value: object) -> float:
    """The timing-bar bonus, held to 1–1.25; anything that isn't a number counts as 1.
    The server can't trust the browser's value: unclamped, 1000 would one-shot
    anything. A bool isn't a number here (Python's True is an int; JS's isn't)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 1
    if isinstance(value, float) and math.isnan(value):
        return 1
    return min(MAX_TIMING, max(1, value))


def int_field(value: object) -> int:
    """An index from the client. Rejects bools, floats, strings and missing values;
    range checks happen where the list is known (a negative index would otherwise
    quietly mean "from the end" in Python)."""
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"Expected an integer, got {value!r}")
    return value


def js_round(x: float) -> int:
    """JavaScript's Math.round: halves round up. Python's round() rounds halves to
    the even neighbour (round(4.5) == 4), which would give different wild levels."""
    return math.floor(x + 0.5)


def opponent_of(side: Side) -> Side:
    return "enemy" if side == "player" else "player"


def active_fighter(state: BattleState) -> Fighter:
    return state["party"][state["active"]]


def base_damage(level: int, power: int, attack: int, defense: int) -> int:
    return math.floor((((2 * level) / 5 + 2) * power * attack) / defense / 50 + 2)


def calc_damage(
    attacker: Fighter,
    defender: Fighter,
    move: Move,
    roll: float,
    crit: bool = False,
    bonus: float = 1,
) -> tuple[int, float]:
    """Damage and the type multiplier. `bonus` is the timing bar, applied last."""
    physical = move_category(move["type"]) == "physical"
    attack = attacker["stats"]["attack" if physical else "specialAttack"]
    defense = defender["stats"]["defense" if physical else "specialDefense"]
    stab = STAB if move["type"] in attacker["creature"]["types"] else 1
    multiplier = effectiveness(move["type"], defender["creature"]["types"])
    # Multiplied in the same order as the TS, so the float rounding is identical.
    raw = math.floor(
        base_damage(attacker["level"], move["power"], attack, defense)
        * roll
        * stab
        * (CRIT_MULTIPLIER if crit else 1)
        * multiplier
        * bonus
    )
    # A hit that isn't immune always does something; flooring a resisted weak hit
    # could otherwise round it to 0.
    damage = 0 if multiplier == 0 else max(1, raw)
    return damage, multiplier


def create_battle(party: list[Fighter], enemy: Fighter) -> BattleState:
    active = next((i for i, f in enumerate(party) if f["hp"] > 0), -1)
    if active < 0:
        raise ValueError("Every team member has fainted")
    return {
        "active": active,
        "caught": False,
        "enemy": enemy,
        "mustSwitch": False,
        "party": party,
        "winner": None,
    }


def create_fighter(
    creature: Pokemon,
    level: int,
    *,
    uid: str,
    hp: int | None = None,
    xp: int | None = None,
) -> Fighter:
    max_hp = max_hp_at(creature["hp"], level)
    return {
        "creature": creature,
        "hp": max_hp if hp is None else min(max_hp, max(0, hp)),
        "level": level,
        "maxHp": max_hp,
        "moves": moves_for(creature["types"]),
        "stats": stats_at(creature, level),
        "uid": uid,
        "xp": max(xp or 0, xp_for_level(level)),
    }


def turn_order(player_speed: int, enemy_speed: int, rng: Rng) -> tuple[Side, Side]:
    """Faster side first; a speed tie is a coin flip (the only time rng is used)."""
    player_first = rng() < 0.5 if player_speed == enemy_speed else player_speed > enemy_speed
    return ("player", "enemy") if player_first else ("enemy", "player")


def wild_level(levels: list[int], rng: Rng) -> int:
    """Round(team average) ± 2: the app has no map, so wild levels follow the team."""
    average = START_LEVEL if not levels else js_round(sum(levels) / len(levels))
    offset = math.floor(rng() * (2 * WILD_LEVEL_SPREAD + 1)) - WILD_LEVEL_SPREAD
    return min(MAX_LEVEL, max(MIN_WILD_LEVEL, average + offset))


def roll_from(rng: Rng) -> float:
    return MIN_ROLL + rng() * (1 - MIN_ROLL)


def hits(move: Move, rng: Rng) -> bool:
    return rng() * 100 < move["accuracy"]


def expected_damage(attacker: Fighter, defender: Fighter, move: Move) -> float:
    """Average damage including the chance to miss (crits ignored)."""
    damage, _ = calc_damage(attacker, defender, move, roll=(MIN_ROLL + 1) / 2)
    return (damage * move["accuracy"]) / 100


def choose_enemy_move(enemy: Fighter, target: Fighter, rng: Rng) -> int:
    """70% of the time the best move by expected damage, otherwise any move."""
    if rng() < ENEMY_BEST_MOVE_CHANCE:
        best, best_damage = 0, -1.0
        for index, move in enumerate(enemy["moves"]):
            value = expected_damage(enemy, target, move)
            if value > best_damage:
                best, best_damage = index, value
        return best
    return min(math.floor(rng() * len(enemy["moves"])), len(enemy["moves"]) - 1)


def resolve_turn(state: BattleState, action: PlayerAction, rng: Rng) -> TurnResult:
    """One turn. Switching and throwing happen before any move (as in the games);
    then the enemy acts. A move turn runs both moves in speed order and stops when
    someone faints."""
    if state["winner"] or state["mustSwitch"]:
        return {"events": [], "state": state}
    nxt = _draft(state)
    events: list[BattleEvent] = []

    kind = action.get("type")
    if kind not in ("move", "switch", "catch"):
        raise ValueError("Unknown action")
    if kind == "move":
        enemy_move = choose_enemy_move(nxt["enemy"], active_fighter(nxt), rng)
        order = turn_order(
            active_fighter(nxt)["stats"]["speed"], nxt["enemy"]["stats"]["speed"], rng
        )
        for side in order:
            if side == "player":
                index = int_field(action.get("index"))
                _attack(nxt, side, index, rng, events, clamp_timing(action.get("timing")))
            else:
                _attack(nxt, side, enemy_move, rng, events)
            if nxt["winner"] or nxt["mustSwitch"]:
                break
    else:
        if kind == "switch":
            _switch_to(nxt, int_field(action.get("to")), events)
        else:
            _throw_ball(nxt, rng, events)
        if not nxt["winner"]:
            enemy_move = choose_enemy_move(nxt["enemy"], active_fighter(nxt), rng)
            _attack(nxt, "enemy", enemy_move, rng, events)

    return {"events": events, "state": nxt}


def send_out(state: BattleState, to: int) -> TurnResult:
    """After a faint: send out another creature. Free, so the enemy doesn't act."""
    if not state["mustSwitch"]:
        return {"events": [], "state": state}
    nxt = _draft(state)
    events: list[BattleEvent] = []
    _switch_to(nxt, int_field(to), events)
    return {"events": events, "state": nxt}


def strike(
    attacker: Fighter,
    defender: Fighter,
    move: Move,
    rng: Rng,
    side: Side,
    target: Side,
    bonus: float,
    events: list[BattleEvent],
) -> bool:
    """One attack: the move event, then a miss or a damage event. Changes the
    defender's hp. Draws rng in order: hit, crit, roll. Returns whether it hit."""
    events.append({"move": move, "side": side, "type": "move"})
    if not hits(move, rng):
        events.append({"side": side, "type": "miss"})
        return False
    crit = rng() < CRIT_CHANCE
    damage, multiplier = calc_damage(attacker, defender, move, roll_from(rng), crit, bonus)
    defender["hp"] = max(0, defender["hp"] - damage)
    events.append(
        {
            "amount": damage,
            "crit": crit and damage > 0,
            "effectiveness": multiplier,
            "hp": defender["hp"],
            "target": target,
            "type": "damage",
        }
    )
    return True


def _attack(
    state: BattleState,
    side: Side,
    move_index: int,
    rng: Rng,
    events: list[BattleEvent],
    bonus: float = 1,
) -> None:
    target = opponent_of(side)
    attacker = active_fighter(state) if side == "player" else state["enemy"]
    defender = active_fighter(state) if target == "player" else state["enemy"]
    if not 0 <= move_index < len(attacker["moves"]):
        raise ValueError(f"No move {move_index} for {side}")
    move = attacker["moves"][move_index]
    struck = strike(attacker, defender, move, rng, side, target, bonus, events)
    if struck and defender["hp"] == 0:
        _faint(state, target, events)


def _award_xp(state: BattleState, events: list[BattleEvent]) -> None:
    """Defeating or catching gives XP to the creature on the field. Leveling raises
    max HP, and current HP rises by the same amount."""
    fighter = active_fighter(state)
    if fighter["level"] >= MAX_LEVEL:
        return
    amount = xp_gain(state["enemy"]["creature"], state["enemy"]["level"])
    fighter["xp"] += amount
    events.append({"amount": amount, "name": fighter["creature"]["name"], "type": "xp"})
    level = level_for_xp(fighter["xp"])
    if level <= fighter["level"]:
        return
    max_hp = max_hp_at(fighter["creature"]["hp"], level)
    fighter["hp"] += max_hp - fighter["maxHp"]
    fighter["level"] = level
    fighter["maxHp"] = max_hp
    fighter["stats"] = stats_at(fighter["creature"], level)
    events.append({"fighter": dict(fighter), "type": "levelUp"})


def _draft(state: BattleState) -> BattleState:
    """Copies everything a turn changes, so the input state is untouched."""
    copy = BattleState(**state)
    copy["enemy"] = Fighter(**state["enemy"])
    copy["party"] = [Fighter(**f) for f in state["party"]]
    return copy


def _faint(state: BattleState, side: Side, events: list[BattleEvent]) -> None:
    events.append({"side": side, "type": "faint"})
    if side == "enemy":
        state["winner"] = "player"
        _award_xp(state, events)
    elif any(f["hp"] > 0 for f in state["party"]):
        state["mustSwitch"] = True
    else:
        state["winner"] = "enemy"
        events.append({"type": "blackout"})


def _switch_to(state: BattleState, to: int, events: list[BattleEvent]) -> None:
    party = state["party"]
    if not 0 <= to < len(party) or to == state["active"] or party[to]["hp"] == 0:
        raise ValueError(f"Can't switch to {to}")
    incoming = party[to]
    came_from = None if state["mustSwitch"] else active_fighter(state)["creature"]["name"]
    state["active"] = to
    state["mustSwitch"] = False
    events.append({"fighter": dict(incoming), "from": came_from, "type": "switch"})


def _throw_ball(state: BattleState, rng: Rng, events: list[BattleEvent]) -> None:
    if len(state["party"]) >= MAX_TEAM:
        raise ValueError("The team is full")
    enemy = state["enemy"]
    chance = capture_chance(catch_rate(enemy["creature"]), enemy["hp"], enemy["maxHp"])
    shakes = shake_checks(chance, rng)
    events.append({"shakes": shakes, "type": "catch"})
    if shakes == 4:
        state["caught"] = True
        state["winner"] = "player"
        _award_xp(state, events)
