from __future__ import annotations

from vanl_cli import exec_utils


def link(args: list[str]) -> None:
    exec_utils.exec_command("vanl-bot-link", args)


def restart(*, daemon: bool) -> None:
    unit = "signal-daemon.service" if daemon else "bot.service"
    exec_utils.exec_command("systemctl", ["restart", unit])


def logs(*, follow: bool, daemon: bool) -> None:
    unit = "signal-daemon.service" if daemon else "bot.service"
    journal_args = ["-u", unit]
    if follow:
        journal_args.append("-f")
    exec_utils.exec_command("journalctl", journal_args)
