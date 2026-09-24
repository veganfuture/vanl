from __future__ import annotations

import pytest

from vanl_cli.commands import bot, web

FakeExecCalls = list[tuple[str, list[str]]]


@pytest.fixture
def fake_execvp(monkeypatch: pytest.MonkeyPatch) -> FakeExecCalls:
    calls: FakeExecCalls = []

    def _fake(binary: str, argv: list[str]) -> None:
        calls.append((binary, argv))

    monkeypatch.setattr("os.execvp", _fake)
    # web.migrate/import_arc/seed_places/seed_organizations all call
    # env_file.require_database_password() before exec'ing - satisfy it here
    # so these dispatch tests don't depend on a real /etc/vanl/web.env.
    monkeypatch.setenv("VANL_DATABASE_PASSWORD", "test-password")
    return calls


def test_web_migrate_forwards_args(fake_execvp: FakeExecCalls) -> None:
    web.migrate(["--foo"])
    assert fake_execvp == [("vanl-web-migrate", ["vanl-web-migrate", "--foo"])]


def test_web_import_arc_forwards_dry_run(fake_execvp: FakeExecCalls) -> None:
    web.import_arc(["--dry-run"])
    assert fake_execvp == [("vanl-web-arc-import", ["vanl-web-arc-import", "--dry-run"])]


def test_web_seed_places(fake_execvp: FakeExecCalls) -> None:
    web.seed_places([])
    assert fake_execvp == [("vanl-web-seed-places", ["vanl-web-seed-places"])]


def test_web_seed_organizations(fake_execvp: FakeExecCalls) -> None:
    web.seed_organizations([])
    assert fake_execvp == [
        ("vanl-web-seed-organizations", ["vanl-web-seed-organizations"])
    ]


def test_web_daily_cleanup(fake_execvp: FakeExecCalls) -> None:
    web.daily_cleanup([])
    assert fake_execvp == [("vanl-web-daily-cleanup", ["vanl-web-daily-cleanup"])]


def test_web_restart(fake_execvp: FakeExecCalls) -> None:
    web.restart()
    assert fake_execvp == [("systemctl", ["systemctl", "restart", "vanl-web.service"])]


def test_web_logs_default(fake_execvp: FakeExecCalls) -> None:
    web.logs(follow=False, arc_import=False, daily_cleanup=False)
    assert fake_execvp == [("journalctl", ["journalctl", "-u", "vanl-web.service"])]


def test_web_logs_follow_arc_import(fake_execvp: FakeExecCalls) -> None:
    web.logs(follow=True, arc_import=True, daily_cleanup=False)
    assert fake_execvp == [
        ("journalctl", ["journalctl", "-u", "vanl-web-arc-import.service", "-f"])
    ]


def test_web_logs_daily_cleanup(fake_execvp: FakeExecCalls) -> None:
    web.logs(follow=False, arc_import=False, daily_cleanup=True)
    assert fake_execvp == [
        ("journalctl", ["journalctl", "-u", "vanl-web-daily-cleanup.service"])
    ]


def test_bot_link_forwards_args(fake_execvp: FakeExecCalls) -> None:
    bot.link(["--machine-name", "foo"])
    assert fake_execvp == [("vanl-bot-link", ["vanl-bot-link", "--machine-name", "foo"])]


def test_bot_restart_default(fake_execvp: FakeExecCalls) -> None:
    bot.restart(daemon=False)
    assert fake_execvp == [("systemctl", ["systemctl", "restart", "bot.service"])]


def test_bot_restart_daemon(fake_execvp: FakeExecCalls) -> None:
    bot.restart(daemon=True)
    assert fake_execvp == [
        ("systemctl", ["systemctl", "restart", "signal-daemon.service"])
    ]


def test_bot_logs_daemon_follow(fake_execvp: FakeExecCalls) -> None:
    bot.logs(follow=True, daemon=True)
    assert fake_execvp == [
        ("journalctl", ["journalctl", "-u", "signal-daemon.service", "-f"])
    ]
