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


def restart() -> None:
    exec_utils.exec_command("systemctl", ["restart", "vanl-web.service"])


def logs(*, follow: bool, arc_import: bool) -> None:
    unit = "vanl-web-arc-import.service" if arc_import else "vanl-web.service"
    journal_args = ["-u", unit]
    if follow:
        journal_args.append("-f")
    exec_utils.exec_command("journalctl", journal_args)
