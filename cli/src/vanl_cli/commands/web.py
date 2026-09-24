from __future__ import annotations

from vanl_cli import env_file, exec_utils


def migrate(args: list[str]) -> None:
    env_file.require_database_password()
    exec_utils.exec_command("vanl-web-migrate", args)


def import_arc(args: list[str]) -> None:
    env_file.require_database_password()
    exec_utils.exec_command("vanl-web-arc-import", args)


def seed_places(args: list[str]) -> None:
    env_file.require_database_password()
    exec_utils.exec_command("vanl-web-seed-places", args)


def seed_organizations(args: list[str]) -> None:
    env_file.require_database_password()
    exec_utils.exec_command("vanl-web-seed-organizations", args)


def daily_cleanup(args: list[str]) -> None:
    env_file.require_database_password()
    exec_utils.exec_command("vanl-web-daily-cleanup", args)


def restart() -> None:
    exec_utils.exec_command("systemctl", ["restart", "vanl-web.service"])


def logs(*, follow: bool, arc_import: bool, daily_cleanup: bool) -> None:
    if arc_import:
        unit = "vanl-web-arc-import.service"
    elif daily_cleanup:
        unit = "vanl-web-daily-cleanup.service"
    else:
        unit = "vanl-web.service"
    journal_args = ["-u", unit]
    if follow:
        journal_args.append("-f")
    exec_utils.exec_command("journalctl", journal_args)
