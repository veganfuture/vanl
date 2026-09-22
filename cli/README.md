# vanl

Unified ops CLI for the Vegan Activists NL production server. `vanl` is a
thin dispatcher: every subcommand ends by replacing itself
(`os.execvp`) with whichever already-installed binary does the real work
(`vanl-web-migrate`, `vanl-bot-link`, `systemctl`, `psql`, ...) — it exists
to give those a single, memorable, discoverable command tree, not to
reimplement them.

It does **not** elevate privileges on your behalf. Run it as whichever OS
user the underlying action needs, exactly like the old per-binary
invocations:

```sh
sudo -u vanl-web vanl web migrate
sudo -u vanl-web vanl web import-arc [--dry-run]
sudo -u vanl-web vanl web seed-places
sudo -u vanl-web vanl web seed-organizations
sudo vanl web restart
vanl web logs [-f] [--arc-import]

sudo -u vanl-bot env HOME=/var/lib/vanl-bot vanl bot link --machine-name <NAME>
sudo vanl bot restart [--daemon]
vanl bot logs [-f] [--daemon]

sudo -u vanl-web vanl db repl
```

`vanl web migrate`/`import-arc`/`seed-places`/`seed-organizations` and
`vanl db repl` all read `VANL_DATABASE_PASSWORD` out of the same
admin-managed env file (`/etc/vanl/web.env` by default) `vanl-web.service`
itself uses, if it isn't already set in your shell - you never need to copy
the password out by hand. That file is only readable by `root` and the
`vanl-secrets` group (`postgres`/`vanl-bot`/`vanl-web`), which is why these
commands need `sudo -u vanl-web` (or root) rather than your own login.

## Development

```sh
nix develop ./cli
pytest
```

`nix build ./cli` builds the package offline (no third-party runtime
dependencies, so no network fetch at build time). `nix run ./cli#check-project`
runs `pyrefly`, `ruff`, and `pytest`, matching `bot/`'s own `check-project`.

See `server/README.md` for how this gets deployed onto the VPS
(`cli/flake.nix`'s `nixosModules.default`, imported by `server/flake.nix`).
