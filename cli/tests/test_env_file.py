from __future__ import annotations

import os
from pathlib import Path

import pytest

from vanl_cli import env_file
from vanl_cli.commands import db, web


def test_parse_env_file_basic() -> None:
    text = """
        # a comment
        VANL_DATABASE_PASSWORD=hunter2
        VANL_BOT_API_SHARED_SECRET=shhh

    """
    assert env_file.parse_env_file(text) == {
        "VANL_DATABASE_PASSWORD": "hunter2",
        "VANL_BOT_API_SHARED_SECRET": "shhh",
    }


def test_parse_env_file_ignores_blank_and_comment_lines() -> None:
    assert env_file.parse_env_file("\n# nothing here\n\nFOO=bar\n") == {"FOO": "bar"}


def test_parse_env_file_value_may_contain_equals_signs() -> None:
    assert env_file.parse_env_file("FOO=a=b=c\n") == {"FOO": "a=b=c"}


def test_require_database_password_uses_already_set_env_var(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VANL_DATABASE_PASSWORD", "already-set")
    # No VANL_CLI_WEB_ENV_FILE set and no /etc/vanl/web.env on this machine -
    # if this reads the file at all, it'll fail; it shouldn't need to.
    monkeypatch.delenv("VANL_CLI_WEB_ENV_FILE", raising=False)

    assert env_file.require_database_password() == "already-set"


def test_require_database_password_reads_env_file_when_unset(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("VANL_DATABASE_PASSWORD=from-file\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))

    assert env_file.require_database_password() == "from-file"
    assert os.environ["VANL_DATABASE_PASSWORD"] == "from-file"


def test_require_database_password_missing_file_exits(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(tmp_path / "does-not-exist.env"))

    with pytest.raises(SystemExit):
        env_file.require_database_password()


def test_require_database_password_missing_key_exits(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("OTHER=ignored\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))

    with pytest.raises(SystemExit):
        env_file.require_database_password()


def test_repl_execs_psql_with_password_from_env_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("VANL_DATABASE_PASSWORD=hunter2\nOTHER=ignored\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))
    monkeypatch.delenv("VANL_CLI_PSQL_BIN", raising=False)

    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    db.repl()

    assert calls == [("psql", ["psql", "-h", "127.0.0.1", "-U", "vanl", "vanl"])]
    assert os.environ["PGPASSWORD"] == "hunter2"
    monkeypatch.delenv("PGPASSWORD", raising=False)


def test_repl_uses_pinned_psql_bin_when_set(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("VANL_DATABASE_PASSWORD=hunter2\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))
    monkeypatch.setenv("VANL_CLI_PSQL_BIN", "/nix/store/abc-postgresql/bin/psql")

    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    db.repl()

    assert calls[0][0] == "/nix/store/abc-postgresql/bin/psql"
    monkeypatch.delenv("PGPASSWORD", raising=False)


def test_repl_missing_password_exits(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("OTHER=ignored\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))

    with pytest.raises(SystemExit):
        db.repl()


def test_repl_missing_file_exits(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(tmp_path / "does-not-exist.env"))

    with pytest.raises(SystemExit):
        db.repl()


def test_web_migrate_sources_password_from_env_file_when_unset(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    web_env = tmp_path / "web.env"
    web_env.write_text("VANL_DATABASE_PASSWORD=hunter2\n")
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(web_env))

    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    web.migrate([])

    assert calls == [("vanl-web-migrate", ["vanl-web-migrate"])]
    assert os.environ["VANL_DATABASE_PASSWORD"] == "hunter2"


def test_web_migrate_missing_password_exits_before_exec(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("VANL_DATABASE_PASSWORD", raising=False)
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(tmp_path / "does-not-exist.env"))

    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    with pytest.raises(SystemExit):
        web.migrate([])

    assert calls == []
