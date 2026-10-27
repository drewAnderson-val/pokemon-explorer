"""Battle results back onto the team: a port of saveBattle in src/lib/team/team.ts."""

from app.engine.types import BattleState, Fighter
from app.engine.wild import MAX_TEAM
from app.teams.store import TeamMember


def from_fighter(fighter: Fighter) -> TeamMember:
    return {
        "creatureId": fighter["creature"]["id"],
        "hp": None if fighter["hp"] >= fighter["maxHp"] else fighter["hp"],
        "level": fighter["level"],
        "uid": fighter["uid"],
        "xp": fighter["xp"],
    }


def write_back(members: list[TeamMember], state: BattleState) -> list[TeamMember]:
    """HP, XP and level by uid, for members still on the team (one removed during the
    battle stays removed). A caught creature joins once, if there's room and it
    isn't already on the team."""
    fighters = {f["uid"]: f for f in state["party"]}
    saved = [from_fighter(fighters[m["uid"]]) if m["uid"] in fighters else m for m in members]
    enemy = state["enemy"]
    if (
        state["caught"]
        and len(saved) < MAX_TEAM
        and all(m["uid"] != enemy["uid"] for m in saved)
        and all(m["creatureId"] != enemy["creature"]["id"] for m in saved)
    ):
        saved.append(from_fighter(enemy))
    return saved
