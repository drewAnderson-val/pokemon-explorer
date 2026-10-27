import pytest

from tests.conftest import assert_local


def test_guard_refuses_non_local_database() -> None:
    with pytest.raises(RuntimeError, match="localhost"):
        assert_local("postgresql://u:p@db.example.com:5432/postgres")


def test_guard_allows_localhost() -> None:
    assert_local("postgresql://postgres:postgres@localhost:54329/postgres")


def test_guard_refuses_host_hidden_in_query_parameters() -> None:
    with pytest.raises(RuntimeError, match="localhost"):
        assert_local("postgresql://postgres:pw@localhost/postgres?host=db.example.com")


def test_guard_refuses_hostaddr_override() -> None:
    with pytest.raises(RuntimeError, match="localhost"):
        assert_local("postgresql://postgres:pw@localhost/postgres?hostaddr=10.1.2.3")
