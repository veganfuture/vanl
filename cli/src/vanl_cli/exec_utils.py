"""Small helpers for dispatching vanl subcommands to already-installed binaries.

vanl is a thin dispatcher, not a reimplementation - every subcommand ends by
replacing the current process (`os.execvp`, mirroring the `exec` convention
this repo's own Nix wrapper scripts already use throughout web/flake.nix and
bot/flake.nix) with whichever pre-existing binary does the real work
(vanl-web-migrate, vanl-bot-link, systemctl, psql, ...). This keeps
stdin/stdout/stderr and signal handling identical to invoking that binary
directly, which matters for interactive cases like `vanl db repl`.
"""

from __future__ import annotations

import os
import sys


def resolve_binary(env_var: str, default: str) -> str:
    """Resolve a binary, preferring the Nix-wrapper-provided override.

    The NixOS module wrapping this package's `vanl` executable bakes in
    exact store paths for binaries where that matters (e.g. VANL_CLI_PSQL_BIN
    -> ${pkgs.postgresql}/bin/psql) - see cli/flake.nix's nixosModules.default.
    The `default` fallback lets `vanl` still do something reasonable when run
    outside that wrapper (e.g. during local development).
    """
    return os.environ.get(env_var, default)


def exec_command(binary: str, args: list[str]) -> None:
    """Replace the current process with `binary args...`."""
    try:
        os.execvp(binary, [binary, *args])
    except FileNotFoundError:
        print(f"vanl: '{binary}' not found on PATH", file=sys.stderr)
        sys.exit(1)
