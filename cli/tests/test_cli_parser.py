from __future__ import annotations

from pathlib import Path

import pytest

from vanl_cli.__main__ import build_parser, dispatch, main


def test_missing_namespace_exits() -> None:
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args([])


def test_missing_verb_exits() -> None:
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["web"])


def test_unknown_namespace_exits() -> None:
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["nope"])


def test_strict_verb_rejects_unknown_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))
    monkeypatch.setattr("sys.argv", ["vanl", "web", "restart", "--bogus"])

    with pytest.raises(SystemExit):
        main()

    assert calls == []


def test_end_to_end_import_arc_dry_run(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))
    monkeypatch.setenv("VANL_DATABASE_PASSWORD", "test-password")

    parser = build_parser()
    args, extra = parser.parse_known_args(["web", "import-arc", "--dry-run"])
    dispatch(args, extra)

    assert calls == [("vanl-web-arc-import", ["vanl-web-arc-import", "--dry-run"])]


def test_end_to_end_daily_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))
    monkeypatch.setenv("VANL_DATABASE_PASSWORD", "test-password")

    parser = build_parser()
    args, extra = parser.parse_known_args(["web", "daily-cleanup"])
    dispatch(args, extra)

    assert calls == [("vanl-web-daily-cleanup", ["vanl-web-daily-cleanup"])]


def test_end_to_end_web_logs_follow_arc_import(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    parser = build_parser()
    args, extra = parser.parse_known_args(["web", "logs", "-f", "--arc-import"])
    dispatch(args, extra)

    assert extra == []
    assert calls == [
        ("journalctl", ["journalctl", "-u", "vanl-web-arc-import.service", "-f"])
    ]


def test_end_to_end_bot_link(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    parser = build_parser()
    args, extra = parser.parse_known_args(["bot", "link", "--machine-name", "my-laptop"])
    dispatch(args, extra)

    assert calls == [
        ("vanl-bot-link", ["vanl-bot-link", "--machine-name", "my-laptop"])
    ]


def test_end_to_end_db_repl(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    env_file = tmp_path / "web.env"
    env_file.write_text("VANL_DATABASE_PASSWORD=hunter2\n")
    monkeypatch.setenv("VANL_CLI_WEB_ENV_FILE", str(env_file))
    monkeypatch.delenv("VANL_CLI_PSQL_BIN", raising=False)

    calls: list[tuple[str, list[str]]] = []
    monkeypatch.setattr("os.execvp", lambda binary, argv: calls.append((binary, argv)))

    parser = build_parser()
    args, extra = parser.parse_known_args(["db", "repl"])
    dispatch(args, extra)

    assert extra == []
    assert calls == [("psql", ["psql", "-h", "127.0.0.1", "-U", "vanl", "vanl"])]
    monkeypatch.delenv("PGPASSWORD", raising=False)
