from __future__ import annotations

import argparse
import sys

from vanl_cli.commands import bot, db, web

# Verbs that just forward whatever the caller passed straight through to an
# underlying binary (e.g. `vanl web import-arc --dry-run` -> `vanl-web-arc-import
# --dry-run`) - anything else is a "strict" verb whose own flags are declared
# on its subparser and validated normally. Kept as a set rather than
# `nargs=argparse.REMAINDER` on each leaf subparser: REMAINDER is documented
# to interact badly with nested subparsers (a token starting with `-` right
# after the verb gets reported as "unrecognized" by the *top-level* parser
# instead of reaching the leaf's REMAINDER positional) - confirmed by hand
# with `vanl web import-arc --dry-run` before switching to this approach.
# `parse_known_args` + manually forwarding the leftover `extra` list sidesteps
# the bug entirely.
FORWARDING_VERBS = {
    ("web", "migrate"),
    ("web", "import-arc"),
    ("web", "seed-places"),
    ("web", "seed-organizations"),
    ("web", "daily-cleanup"),
    ("bot", "link"),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vanl", description="Vegan Activists NL server ops CLI"
    )
    subparsers = parser.add_subparsers(dest="namespace", required=True)

    web_parser = subparsers.add_parser("web", help="Website (vanl-web.service) operations")
    web_sub = web_parser.add_subparsers(dest="verb", required=True)

    web_sub.add_parser("migrate", help="Run pending DB migrations")
    web_sub.add_parser("import-arc", help="Import events from animalrightscalendar.com")
    web_sub.add_parser("seed-places", help="Seed the places table from PDOK")
    web_sub.add_parser("seed-organizations", help="Seed the fixed organizations list")
    web_sub.add_parser("daily-cleanup", help="Run daily database cleanup tasks now")
    web_sub.add_parser("restart", help="systemctl restart vanl-web.service")
    web_logs = web_sub.add_parser("logs", help="journalctl -u vanl-web.service")
    web_logs.add_argument("-f", "--follow", action="store_true")
    web_logs.add_argument(
        "--arc-import", action="store_true", help="Show the ARC import service's logs instead"
    )
    web_logs.add_argument(
        "--daily-cleanup",
        action="store_true",
        help="Show the daily cleanup service's logs instead",
    )

    bot_parser = subparsers.add_parser("bot", help="Signal bot operations")
    bot_sub = bot_parser.add_subparsers(dest="verb", required=True)

    bot_sub.add_parser("link", help="Link a new Signal device (signal-cli link)")
    bot_restart = bot_sub.add_parser("restart", help="systemctl restart bot.service")
    bot_restart.add_argument(
        "--daemon", action="store_true", help="Restart signal-daemon.service instead"
    )
    bot_logs = bot_sub.add_parser("logs", help="journalctl -u bot.service")
    bot_logs.add_argument("-f", "--follow", action="store_true")
    bot_logs.add_argument(
        "--daemon", action="store_true", help="Show signal-daemon.service's logs instead"
    )

    db_parser = subparsers.add_parser("db", help="Database operations")
    db_sub = db_parser.add_subparsers(dest="verb", required=True)
    db_sub.add_parser("repl", help="Open a psql shell against the production database")

    return parser


def dispatch(args: argparse.Namespace, extra: list[str]) -> None:
    if args.namespace == "web":
        if args.verb == "migrate":
            web.migrate(extra)
        elif args.verb == "import-arc":
            web.import_arc(extra)
        elif args.verb == "seed-places":
            web.seed_places(extra)
        elif args.verb == "seed-organizations":
            web.seed_organizations(extra)
        elif args.verb == "daily-cleanup":
            web.daily_cleanup(extra)
        elif args.verb == "restart":
            web.restart()
        elif args.verb == "logs":
            web.logs(
                follow=args.follow, arc_import=args.arc_import, daily_cleanup=args.daily_cleanup
            )
    elif args.namespace == "bot":
        if args.verb == "link":
            bot.link(extra)
        elif args.verb == "restart":
            bot.restart(daemon=args.daemon)
        elif args.verb == "logs":
            bot.logs(follow=args.follow, daemon=args.daemon)
    elif args.namespace == "db":
        if args.verb == "repl":
            db.repl()


def main() -> int:
    parser = build_parser()
    args, extra = parser.parse_known_args()

    if (args.namespace, args.verb) not in FORWARDING_VERBS and extra:
        parser.error(f"unrecognized arguments: {' '.join(extra)}")

    dispatch(args, extra)
    return 0


if __name__ == "__main__":
    sys.exit(main())
