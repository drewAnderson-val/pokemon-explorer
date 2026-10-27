import pytest

from app.pokemon.params import PokemonQuery, parse_pokemon_query


def parse(**params: str | list[str]) -> PokemonQuery:
    lists = {k: v if isinstance(v, list) else [v] for k, v in params.items()}
    result = parse_pokemon_query(lists)
    assert isinstance(result, PokemonQuery), result
    return result


def test_applies_defaults() -> None:
    assert parse() == PokemonQuery(limit=20, page=1, search="", sort="id", type=None)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("page", ["0"]),
        ("page", ["abc"]),
        ("page", ["1.5"]),
        ("limit", ["0"]),
        ("limit", ["101"]),
        ("sort", ["name"]),
        ("type", ["Plasma"]),
        ("search", ["a" * 101]),
        ("search", ["a", "b"]),
    ],
)
def test_rejects(key: str, value: list[str]) -> None:
    assert isinstance(parse_pokemon_query({key: value}), str)


def test_accepts_a_search_at_the_length_cap() -> None:
    assert len(parse(search="a" * 100).search) == 100


def test_canonicalizes_type_case_and_trims_search() -> None:
    query = parse(search="  fire ", type="fire")
    assert (query.search, query.type) == ("fire", "Fire")


def test_repeated_search_is_rejected() -> None:
    assert parse_pokemon_query({"search": ["a", "b"]}) == "search must be a single string"


def test_repeated_page_is_rejected() -> None:
    assert parse_pokemon_query({"page": ["1", "2"]}) == "page must be a positive integer"


def test_empty_values_mean_defaults() -> None:
    assert parse(page="", type="") == PokemonQuery(20, 1, "", "id", None)
