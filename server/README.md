# Deployment

The VPS (NixOS) is described by `server/flake.nix`, which composes it from three independent
flakes: `server/` (the host itself — disko disk layout, Postgres, Cloudflare Tunnel, secrets
directory), `bot/` (the Signal bot, as a `nixosModules.default`), and `web/` (the website, same).
`bot` and `web` each ship their code as fully pre-built Nix packages (fetched/built once via a
fixed-output derivation, then assembled offline) rather than a live git checkout the VPS pulls —
so **`nixos-rebuild switch` is the one and only deploy command, for both infrastructure and code
changes**. There's no separate build/rsync/git-pull step for either project.

## Provisioning a fresh server

```sh
nix run github:nix-community/nixos-anywhere -- --generate-hardware-config nixos-generate-config ./hardware-configuration.nix --flake .#vanl-hostkey1 --target-host $VANL_HOSTKEY1
```

Run with `--generate-hardware-config` if the hardware has changed.

## One-time Cloudflare Tunnel setup

The website is reachable exclusively via a Cloudflare Tunnel (`services.cloudflared` in
`server/configuration.nix`) — no inbound port beyond SSH is ever opened. Setting up the tunnel
itself is a one-time, interactive, Cloudflare-side step, not Nix-managed:

```sh
cloudflared tunnel login
cloudflared tunnel create vanl-web       # prints the tunnel UUID and writes its credentials JSON
cloudflared tunnel route dns <tunnel-id> veganactivists.nl
```

Copy the tunnel UUID into `server/configuration.nix`'s `services.cloudflared.tunnels.<id>`
(replacing the `REPLACE-WITH-REAL-TUNNEL-UUID` placeholder), and place the credentials JSON the
`create` command produced at `/etc/vanl/cloudflared-credentials.json` on the VPS (see the initial
setup runbook below for how secrets get there).

## Deploying

```sh
nixos-rebuild switch --flake .#vanl-hostkey1 --target-host $VANL_HOSTKEY1 --sudo
```

Run this from your own up-to-date local checkout — it picks up both infrastructure changes and
new `bot`/`web` commits (including uncommitted local changes) in one step, and restarts whichever
services changed automatically (`restartTriggers` on each service watches its own build output).

Two things stay manual by design, since Nix can't compute either for you:

- **`nix run ./web#update-web-deps-hash`** (or `nix run ./bot#update-bot-venv-hash`) whenever the
  respective lockfile (`web/bun.lock`, `bot/uv.lock`) changes — recomputes the fixed-output
  derivation's hash and prints the new value to paste into `flake.nix`. Run these from
  `server/`, not from `web/`/`bot/` themselves — the hash depends on which nixpkgs revision
  actually builds it, and `server/flake.nix`'s composed, `nixpkgs.follows`-applied evaluation is
  the one that matters for deployment (see the comment on `webDeps`'s `outputHash` in
  `web/flake.nix` for why).
- **`vanl-web-migrate`**, run by hand over SSH on the VPS after a deploy that includes schema
  changes — DB migrations deliberately don't auto-run on every restart.

## Initial setup runbook

The first `nixos-rebuild switch` will leave `bot.service`, `signal-daemon.service`, and
`vanl-web.service` restart-looping harmlessly, since `/etc/vanl/*.env` don't exist yet. Write
those files by hand on the VPS (never committed — plain `EnvironmentFile=`s, admin-managed):

- `/etc/vanl/bot.env` — `VANL_SIGNUP_PRIVATE_KEY`, `VANL_BOT_API_SHARED_SECRET`,
  `VANL_BOT_SIGNAL_ACCOUNT` (the bot's Signal phone number, e.g. `+316...`; see
  `bot/README.md`, "Environment Variables", for how to generate the first two).
- `/etc/vanl/web.env` — `VANL_DATABASE_PASSWORD`, `VANL_BOT_API_SHARED_SECRET` (same value as the
  bot's — it's a shared secret).
- `/etc/vanl/cloudflared-credentials.json` — from `cloudflared tunnel create` above.

Then:

```sh
ssh $VANL_HOSTKEY1 -- sudo systemctl restart bot.service signal-daemon.service vanl-web.service 'cloudflared-tunnel-*.service'
# create the schema, once:
ssh $VANL_HOSTKEY1 -- sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from /etc/vanl/web.env> vanl-web-migrate
```

First-time Signal device linking (`vanl-bot-link`, run as the `vanl-bot` user with
`HOME=/var/lib/vanl-bot`) is documented in `bot/README.md`.

## Wiping and reimporting the database

Destructive - drops every table (events, organizations, users, sessions, everything).
There's no undo beyond a backup, so double-check `$VANL_HOSTKEY1` before running this
against prod. `vanl-web-seed-places`/`vanl-web-seed-organizations` only exist after a
`nixos-rebuild switch` that includes them - deploy first if this is a fresh checkout.

```sh
# Stop anything holding a connection or that could run mid-wipe.
ssh $VANL_HOSTKEY1 -- sudo systemctl stop vanl-web.service vanl-web-arc-import.timer

# Drop and recreate the database (as the postgres superuser, so it's not blocked by
# `vanl-web`'s own connections - the stop above should have already closed those, but
# DROP DATABASE still fails if anything else is connected).
ssh $VANL_HOSTKEY1 -- sudo -u postgres psql -c 'DROP DATABASE vanl;' -c 'CREATE DATABASE vanl OWNER vanl;'

# Rebuild the schema, then reload - seed-places and seed-organizations must both run
# before arc-import (see each script's own header comment for why: arc-import resolves
# event locations against `places`, and links detected organizers against `organizations`).
ssh $VANL_HOSTKEY1 -- sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from /etc/vanl/web.env> vanl-web-migrate
ssh $VANL_HOSTKEY1 -- sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from /etc/vanl/web.env> vanl-web-seed-places
ssh $VANL_HOSTKEY1 -- sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from /etc/vanl/web.env> vanl-web-seed-organizations
ssh $VANL_HOSTKEY1 -- sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from /etc/vanl/web.env> vanl-web-arc-import

# Bring everything back.
ssh $VANL_HOSTKEY1 -- sudo systemctl start vanl-web.service vanl-web-arc-import.timer
```
