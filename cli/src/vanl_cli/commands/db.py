from __future__ import annotations

import os

from vanl_cli import env_file, exec_utils

# Mirrors server/configuration.nix's `ensureDatabases`/`ensureUsers` and
# web/configs/prod.toml's `database` section - both already single-valued for
# this single-VPS deployment, same practical-hardcoding precedent as
# web/flake.nix's devdb-repl (its own dev-only equivalent) uses for `vanl_dev`.
DB_HOST = "127.0.0.1"
DB_USER = "vanl"
DB_NAME = "vanl"


def repl() -> None:
    password = env_file.require_database_password()
    os.environ["PGPASSWORD"] = password
    psql_bin = exec_utils.resolve_binary("VANL_CLI_PSQL_BIN", "psql")
    exec_utils.exec_command(psql_bin, ["-h", DB_HOST, "-U", DB_USER, DB_NAME])
