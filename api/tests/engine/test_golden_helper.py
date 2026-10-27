import pytest

from tests.engine.golden import assert_same_json, scenarios


def test_float_where_json_had_an_int_fails() -> None:
    with pytest.raises(AssertionError, match="24.0"):
        assert_same_json({"a": 24.0}, {"a": 24})


def test_bool_is_not_an_int() -> None:
    with pytest.raises(AssertionError):
        assert_same_json(1, True)


def test_missing_and_extra_keys_fail() -> None:
    with pytest.raises(AssertionError, match="keys"):
        assert_same_json({"a": 1, "b": 2}, {"a": 1})


def test_equal_json_passes() -> None:
    assert_same_json({"a": [1, 0.5, None, "x"]}, {"a": [1, 0.5, None, "x"]})


def test_golden_file_has_every_scenario() -> None:
    assert len(scenarios()) == 16
