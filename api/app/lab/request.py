"""The lab's request, prompt and stat roll (server/create.ts, ported): the same
checks and messages, the same prompt, the same ranges in the same order."""

import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.engine.type_chart import POKEMON_TYPES

MAX_NAME_LENGTH = 30
MAX_DESCRIPTION_LENGTH = 200
MAX_CREATURE_TYPES = 2


@dataclass(frozen=True)
class CreatureRequest:
    name: str
    types: list[str]
    description: str


def clean(text: str) -> str:
    """User text ends up inside a quoted prompt field, so newlines and quotes are
    flattened rather than letting it restructure the prompt."""
    return re.sub(r"\s+", " ", re.sub(r"[\"“”\n\r\t]+", " ", text)).strip()


def parse_creature_request(body: object) -> CreatureRequest | str:
    """The request, or the 400 message."""
    if not isinstance(body, dict):
        return "body must be a JSON object"

    name = body.get("name")
    if not isinstance(name, str):
        return "name is required"
    if len(name) > MAX_NAME_LENGTH:
        return f"name must be at most {MAX_NAME_LENGTH} characters"
    name = clean(name)
    if name == "":
        return "name is required"

    raw_types = body.get("types")
    if not isinstance(raw_types, list) or not 1 <= len(raw_types) <= MAX_CREATURE_TYPES:
        return f"types must list 1 to {MAX_CREATURE_TYPES} types"
    types: list[str] = []
    for type_ in raw_types:
        if not isinstance(type_, str) or type_ not in POKEMON_TYPES:
            return f"unknown type: {type_}"
        if type_ not in types:
            types.append(type_)

    description = body.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        return "description must be a string"
    if len(description) > MAX_DESCRIPTION_LENGTH:
        return f"description must be at most {MAX_DESCRIPTION_LENGTH} characters"

    return CreatureRequest(name=name, types=types, description=clean(description))


def build_prompt(request: CreatureRequest) -> str:
    """The style is fixed here so every creature looks like it belongs on a card;
    the user only fills in the quoted fields."""
    lines = [
        "Create an original creature character as a trading-card style illustration.",
        f'Name: "{request.name}".',
        f"Type: {'/'.join(request.types)}. Let the type shape its colours, body and features.",
        f'Concept: "{request.description}".' if request.description else "",
        "One creature, full body, centred, friendly cartoon style with bold outlines,",
        "on a simple background in its type colours.",
        "No text, letters, logos or card frames in the image.",
        "It must be a new design, not an existing Pokémon or other copyrighted character.",
    ]
    return " ".join(line for line in lines if line)


def roll_creature(
    request: CreatureRequest, image_url: str, rng: Callable[[], float]
) -> dict[str, Any]:
    """Stats are flavour, rolled in the catalog's ranges. The draws happen in the
    order of rollCreature's object literal: attack, defense, height, hp,
    specialAttack, specialDefense, speed, weight."""

    def between(low: int, high: int) -> int:
        return low + math.floor(rng() * (high - low + 1))

    attack = between(20, 150)
    defense = between(20, 150)
    height = between(3, 30) / 10
    hp = between(30, 150)
    special_attack = between(20, 150)
    special_defense = between(20, 150)
    speed = between(20, 150)
    weight = between(10, 1500) / 10
    return {
        "attack": attack,
        "defense": defense,
        "description": request.description
        or f"A newly discovered {'/'.join(request.types)}-type creature.",
        "generation": 10,
        "height": height,
        "hp": hp,
        "imageUrl": image_url,
        "isLegendary": False,
        "name": request.name,
        "specialAttack": special_attack,
        "specialDefense": special_defense,
        "speed": speed,
        "types": request.types,
        "weight": weight,
    }
