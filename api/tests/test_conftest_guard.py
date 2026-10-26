import pytest

from tests.conftest import assert_local


def test_guard_refuses_non_local_database() -> None:
    with pytest.raises(RuntimeError, match="localhost"):
        assert_local("postgresql://u:p@db.supabase.co:5432/postgres")


def test_guard_allows_localhost() -> None:
    assert_local("postgresql://postgres:postgres@localhost:54329/postgres")
