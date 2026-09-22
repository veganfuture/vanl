"""Reads the admin-managed web env file (/etc/vanl/web.env by default) -
shared by every command that needs VANL_DATABASE_PASSWORD (`db repl`, and
`web migrate`/`import-arc`/`seed-places`/`seed-organizations`, which read
process.env.VANL_DATABASE_PASSWORD directly - see web/scripts/migrate.ts).
Outside of vanl-web.service's own EnvironmentFile=, nothing populates that
var for an interactive shell automatically; this is what replaces the old
runbook step of copying the password out of the file by hand.
"""

from __future__ import annotations

import os
import sys

DEFAULT_WEB_ENV_FILE = "/etc/vanl/web.env"


def parse_env_file(text: str) -> dict[str, str]:
    """Parses systemd EnvironmentFile= syntax: KEY=value lines, blank lines
    and '#'-prefixed comments ignored, no shell expansion/quoting - matches
    systemd.exec(5)'s own EnvironmentFile= format, since that's what these
    admin-managed files (e.g. /etc/vanl/web.env) are written for."""
    result: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition("=")
        if not sep:
            continue
        result[key.strip()] = value.strip()
    return result


def web_env_file_path() -> str:
    return os.environ.get("VANL_CLI_WEB_ENV_FILE", DEFAULT_WEB_ENV_FILE)


def read_web_env_file() -> dict[str, str]:
    env_file = web_env_file_path()
    try:
        with open(env_file, encoding="utf-8") as f:
            return parse_env_file(f.read())
    except OSError as e:
        print(f"vanl: could not read {env_file}: {e}", file=sys.stderr)
        sys.exit(1)


def require_database_password() -> str:
    """Returns VANL_DATABASE_PASSWORD, sourcing it from the web env file (and
    exporting it into os.environ, so a subsequent os.execvp inherits it) if
    the caller hasn't already set it themselves. Exits with a clear message
    instead of letting the underlying script fail with a raw postgres auth
    error."""
    existing = os.environ.get("VANL_DATABASE_PASSWORD")
    if existing:
        return existing

    env_vars = read_web_env_file()
    password = env_vars.get("VANL_DATABASE_PASSWORD")
    if not password:
        print(
            f"vanl: VANL_DATABASE_PASSWORD not found in {web_env_file_path()}",
            file=sys.stderr,
        )
        sys.exit(1)

    os.environ["VANL_DATABASE_PASSWORD"] = password
    return password
