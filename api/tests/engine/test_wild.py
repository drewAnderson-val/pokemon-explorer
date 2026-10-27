import copy

import pytest

from app.engine.moves import move_category
from app.engine.types import BattleState, Fighter, Move
from app.engine.wild import (
    MAX_TEAM,
    active_fighter,
    base_damage,
    calc_damage,
    choose_enemy_move,
    create_battle,
    js_round,
    resolve_turn,
    send_out,
    turn_order,
    wild_level,
)
from tests.engine.helpers import ScriptedRng, make_fighter

# Crit check value that never crits (1/24 ≈ 0.042).
NO_CRIT = 0.5


def move(type_: str, power: int, accuracy: int = 100) -> Move:
    return {"accuracy": accuracy, "name": f"{type_} {power}", "power": power, "type": type_}


def test_base_damage_uses_the_attacker_level() -> None:
    assert base_damage(50, 60, 100, 100) == 28
    assert base_damage(5, 60, 15, 15) == 6


def test_calc_damage_uses_stats_stab_and_type() -> None:
    fire = make_fighter(specialAttack=120, types=["Fire"])
    grass = make_fighter(specialDefense=80, types=["Grass"])
    assert calc_damage(fire, grass, move("Fire", 85), roll=1) == (171, 2)
    assert calc_damage(fire, grass, move("Fire", 85), roll=0.85)[0] == 145
    assert calc_damage(fire, grass, move("Fire", 85), roll=1, crit=True)[0] == 256


def test_calc_damage_makes_level_matter() -> None:
    strong = make_fighter(50, types=["Water"])
    weak = make_fighter(5, types=["Water"])
    tackle = move("Normal", 60)
    assert calc_damage(weak, weak, tackle, roll=1)[0] == 6
    assert calc_damage(strong, weak, tackle, roll=1)[0] == 186


def test_physical_and_special_use_their_own_stats() -> None:
    attacker = make_fighter(attack=200, specialAttack=10, types=["Water"])
    defender = make_fighter(defense=50, specialDefense=200)
    assert calc_damage(attacker, defender, move("Rock", 50), roll=1)[0] == base_damage(
        50, 50, 205, 55
    )
    assert calc_damage(attacker, defender, move("Ice", 50), roll=1)[0] == base_damage(
        50, 50, 15, 205
    )


@pytest.mark.parametrize(
    "type_", ["Normal", "Fighting", "Ground", "Rock", "Bug", "Ghost", "Steel", "Poison"]
)
def test_physical_types(type_: str) -> None:
    assert move_category(type_) == "physical"


@pytest.mark.parametrize(
    "type_",
    ["Fire", "Water", "Grass", "Electric", "Ice", "Psychic", "Dragon", "Dark", "Fairy", "Flying"],
)
def test_special_types(type_: str) -> None:
    assert move_category(type_) == "special"


def test_immune_is_0_and_anything_else_at_least_1() -> None:
    ghost = make_fighter(types=["Ghost"])
    assert calc_damage(make_fighter(), ghost, move("Normal", 90), roll=1) == (0, 0)
    weak = make_fighter(5, specialAttack=10)
    wall = make_fighter(specialDefense=230, types=["Water", "Dragon"])
    assert calc_damage(weak, wall, move("Fire", 45), roll=0.85) == (1, 0.25)


def test_faster_goes_first_without_the_rng() -> None:
    rng = ScriptedRng()
    assert turn_order(120, 80, rng) == ("player", "enemy")
    assert turn_order(30, 31, rng) == ("enemy", "player")


def test_speed_tie_is_random() -> None:
    assert turn_order(90, 90, ScriptedRng(0.2)) == ("player", "enemy")
    assert turn_order(90, 90, ScriptedRng(0.7)) == ("enemy", "player")


def test_enemy_picks_best_70_percent() -> None:
    assert choose_enemy_move(make_fighter(), make_fighter(), ScriptedRng(0.69)) == 3


def test_enemy_accounts_for_matchups() -> None:
    enemy = make_fighter(types=["Fighting", "Electric"])
    assert choose_enemy_move(enemy, make_fighter(types=["Ghost"]), ScriptedRng(0)) == 2


def test_enemy_otherwise_random() -> None:
    assert choose_enemy_move(make_fighter(), make_fighter(), ScriptedRng(0.7, 0.5)) == 2


def test_wild_level() -> None:
    assert wild_level([10, 20], ScriptedRng(0)) == 13
    assert wild_level([10, 20], ScriptedRng(0.99)) == 17
    assert wild_level([1], ScriptedRng(0)) == 2
    assert wild_level([100], ScriptedRng(0.99)) == 100


def test_js_round_rounds_half_up() -> None:
    # Python's round(5.5) is 6 but round(4.5) is 4 (to even); JS Math.round gives 5.
    assert js_round(4.5) == 5
    assert js_round(5.5) == 6
    assert wild_level([4, 5], ScriptedRng(0.5)) == 5


def fast() -> Fighter:
    return make_fighter(id=1, name="Fast", speed=120, uid="a")


def slow() -> Fighter:
    return make_fighter(id=2, name="Slow", speed=80, uid="w")


def battle_of(party: list[Fighter] | None = None, enemy: Fighter | None = None) -> BattleState:
    return create_battle(party or [fast()], enemy or slow())


def test_both_attacks_in_speed_order() -> None:
    battle = battle_of()
    result = resolve_turn(
        battle, {"index": 1, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0)
    )
    assert result["events"] == [
        {"move": battle["party"][0]["moves"][1], "side": "player", "type": "move"},
        {"amount": 35, "crit": False, "effectiveness": 1, "hp": 125, "target": "enemy",
         "type": "damage"},
        {"move": battle["enemy"]["moves"][3], "side": "enemy", "type": "move"},
        {"amount": 52, "crit": False, "effectiveness": 1, "hp": 108, "target": "player",
         "type": "damage"},
    ]  # fmt: skip
    assert battle["enemy"]["hp"] == 160


def test_resolve_turn_leaves_input_unchanged() -> None:
    battle = battle_of()
    before = copy.deepcopy(battle)
    resolve_turn(battle, {"index": 1, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0))
    assert battle == before


def test_critical_hits() -> None:
    events = resolve_turn(
        battle_of(), {"index": 1, "type": "move"}, ScriptedRng(0, 0, 0, 0, 0, NO_CRIT, 0)
    )["events"]
    assert events[1]["amount"] == 53 and events[1]["crit"] is True


def test_timing_bonus_only_on_player() -> None:
    events = resolve_turn(
        battle_of(),
        {"index": 1, "timing": 1.25, "type": "move"},
        ScriptedRng(0, 0, NO_CRIT, 0, 0, NO_CRIT, 0),
    )["events"]
    assert (events[1]["amount"], events[1]["target"]) == (44, "enemy")
    assert (events[3]["amount"], events[3]["target"]) == (52, "player")


def test_a_miss() -> None:
    result = resolve_turn(
        battle_of(), {"index": 1, "type": "move"}, ScriptedRng(0, 0.99, 0, NO_CRIT, 0)
    )
    assert result["events"][1] == {"side": "player", "type": "miss"}
    assert result["state"]["enemy"]["hp"] == 160


def test_win_and_xp() -> None:
    battle = battle_of()
    battle["enemy"]["hp"] = 10
    result = resolve_turn(battle, {"index": 0, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0))
    assert result["events"][-2:] == [
        {"side": "enemy", "type": "faint"},
        {"amount": 1035, "name": "Fast", "type": "xp"},
    ]
    state = result["state"]
    assert state["winner"] == "player"
    assert active_fighter(state)["xp"] == 125_000 + 1035
    assert dict(resolve_turn(state, {"index": 0, "type": "move"}, ScriptedRng())) == {
        "events": [],
        "state": state,
    }


def test_level_up_raises_max_and_current_hp() -> None:
    rookie = make_fighter(5, id=1, name="Rookie", speed=200, uid="r")
    sluggish = make_fighter(50, id=2, speed=1, uid="w")
    battle = battle_of([rookie], sluggish)
    battle["enemy"]["hp"] = 1
    result = resolve_turn(battle, {"index": 0, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0))
    last = result["events"][-1]
    assert last["type"] == "levelUp"
    fighter = last["fighter"]
    assert isinstance(fighter, dict)
    assert (fighter["hp"], fighter["level"], fighter["maxHp"]) == (40, 10, 40)


def test_switch_after_a_faint_when_another_can_fight() -> None:
    weak = make_fighter(id=1, name="Weak", speed=10, hp=1, uid="a")
    backup = make_fighter(id=3, name="Backup", uid="b")
    result = resolve_turn(
        battle_of([weak, backup]), {"index": 0, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0)
    )
    assert result["events"][-1] == {"side": "player", "type": "faint"}
    state = result["state"]
    assert (state["mustSwitch"], state["winner"]) == (True, None)
    assert resolve_turn(state, {"index": 0, "type": "move"}, ScriptedRng())["events"] == []
    sent = send_out(state, 1)
    assert sent["events"] == [
        {"fighter": sent["state"]["party"][1], "from": None, "type": "switch"}
    ]
    assert (sent["state"]["active"], sent["state"]["mustSwitch"]) == (1, False)


def test_blackout_only_when_all_fainted() -> None:
    weak = make_fighter(id=1, speed=10, hp=1, uid="a")
    result = resolve_turn(
        battle_of([weak]), {"index": 0, "type": "move"}, ScriptedRng(0, 0, NO_CRIT, 0)
    )
    assert result["events"][-2:] == [{"side": "player", "type": "faint"}, {"type": "blackout"}]
    assert result["state"]["winner"] == "enemy"


def test_switch_happens_before_the_enemy_attacks() -> None:
    battle = battle_of([fast(), make_fighter(id=3, name="Second", uid="b")])
    result = resolve_turn(battle, {"to": 1, "type": "switch"}, ScriptedRng(0, 0, NO_CRIT, 0))
    events, state = result["events"], result["state"]
    assert (events[0]["type"], events[0]["from"]) == ("switch", "Fast")
    assert (events[2]["type"], events[2]["target"]) == ("damage", "player")
    assert state["active"] == 1
    assert state["party"][1]["hp"] < 160
    assert state["party"][0]["hp"] == 160


def test_catch_with_four_shakes_and_no_enemy_attack() -> None:
    result = resolve_turn(battle_of(), {"type": "catch"}, ScriptedRng(0, 0, 0, 0))
    assert result["events"][0] == {"shakes": 4, "type": "catch"}
    assert (result["state"]["caught"], result["state"]["winner"]) == (True, "player")


def test_enemy_attacks_after_a_failed_throw() -> None:
    result = resolve_turn(battle_of(), {"type": "catch"}, ScriptedRng(0.99, 0, 0, NO_CRIT, 0))
    assert result["events"][0] == {"shakes": 0, "type": "catch"}
    assert (result["events"][1]["side"], result["events"][1]["type"]) == ("enemy", "move")
    assert result["state"]["caught"] is False


def test_refuses_to_catch_with_a_full_team() -> None:
    party = [make_fighter(id=i + 1, uid=f"m{i}") for i in range(MAX_TEAM)]
    with pytest.raises(ValueError):
        resolve_turn(battle_of(party), {"type": "catch"}, ScriptedRng(0))
