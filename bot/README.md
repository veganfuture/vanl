# Signal Bot (Nix + NixOS)

This project runs a **Signal bot** on a NixOS server, composed declaratively via
`../server/flake.nix`. This flake exposes a `nixosModules.default` (`services.vanl-bot`) that
`server/` imports; the bot's code ships as a fully pre-built Nix package (`bot`), so
`nixos-rebuild switch` — run from `../server/`, see the root `README.md` — is the entire deploy
story: no git pull, no polling, no separate install step on the server itself.

---

# Architecture

The system has four parts:

### 1. Nix runtime

Nix provides the system-level tools:

* Python
* uv
* signal-cli
* git

This ensures the server always runs with the correct versions.

### 2. Python virtual environment

In production, the venv is built once as a Nix package (`bot`, a fixed-output derivation
that runs `uv export`/`uv pip install --target` — see `flake.nix`) and shipped as an immutable
Nix store path; `bot.service` execs its installed console script directly, no `uv` invocation at
service-start time. For local development, `nix develop` runs `uv sync --frozen` into a regular
`.venv/` instead.

### 3. signal-cli daemon

`signal-cli` runs as a persistent daemon and exposes a local JSON-RPC Unix socket at:

```
$signal_daemon_dir/run/signal-cli.sock
```

The Python bot connects to that socket instead of spawning a fresh `signal-cli` process for every
command — its own `signal_daemon_socket_path` config value (see `configs/dev.toml`/`configs/prod.toml`)
must be kept in sync with wherever `--signal-daemon-dir` puts it.

### 4. systemd services

Two systemd units manage the bot, declared by `nixosModules.default` (`services.vanl-bot`) in
`flake.nix` and enabled in `../server/configuration.nix`:

| Unit               | Purpose                             |
| ------------------ | ----------------------------------- |
| `signal-daemon.service` | Runs persistent `signal-cli` daemon |
| `bot.service`    | Runs the bot                        |

Both restart automatically whenever `bot`'s contents change (`restartTriggers`), which
happens as part of `nixos-rebuild switch` — see the root `README.md`'s "Deploying" section.

---

# Environment Variables

On top of its TOML config file, the bot reads a couple of secrets from the
environment. They're loaded once up front (`BotEnv.load()` in
`src/bot/bot_env.py`) — if any are missing, the bot refuses to start and
prints exactly which ones, what they're for, and how to get them, instead of
failing later with a confusing error.

| Variable | Purpose |
| --- | --- |
| `VANL_SIGNUP_PRIVATE_KEY` | Signs the signup links the bot sends over Signal. |
| `VANL_BOT_API_SHARED_SECRET` | Authenticates the website's calls into the bot's local HTTP API. |
| `VANL_BOT_WEBSITE_API_TOKEN` | Sent as a Bearer token when the bot calls the website's public API as the `signal-bot` account - used for event ingestion today, and any other website API the bot calls as itself going forward. |
| `VANL_BOT_DATABASE_PASSWORD` | Password for the `vanl_bot` Postgres role the bot uses for its own Signal message archive tables (`bot_archived_*`, `bot_event_notifications`) - no access to `events`/`users`/etc. |

Set them in your shell (e.g. via `.envrc`/`.env` for local development), or
as `Environment=` entries in the `bot.service` systemd unit in production.

There's also `VANL_BOT_SIGNAL_ACCOUNT` — the bot's Signal phone number (e.g.
`+316...`). It isn't part of `BotEnv`/`bot.service`; it's read by the
`signal-daemon.service` unit (and by `nix run .#signal-daemon` locally) to
launch `signal-cli` under the right account, so it never has to be committed
to a NixOS config. In production it lives in the same `bot.env` file as the
two variables above (`environmentFile` is shared by both systemd units).

## `VANL_SIGNUP_PRIVATE_KEY`

An Ed25519 keypair used to sign the single-use signup links the bot sends to
people over Signal. The bot holds the private key (this environment
variable); the website is given the matching public key (the
`signup_public_key` field in its own TOML config) to verify those signatures.

Generate a fresh keypair with:

```sh
nix run .#generate-signup-key
```

This prints two lines:

```
VANL_SIGNUP_PRIVATE_KEY (bot secret, env var)  = <...>
signup_public_key (website config, not secret) = <...>
```

Set the first as the bot's `VANL_SIGNUP_PRIVATE_KEY` environment variable,
and put the second in the website's config under `signup_public_key`.

## `VANL_BOT_API_SHARED_SECRET`

A plain shared secret (not a keypair) the website sends as a Bearer token
when it calls the bot's local HTTP API (to relay a one-time login code over
Signal, see `src/bot/api_server.py`). Any sufficiently random string works —
generate one with:

```sh
openssl rand -hex 32
```

Set the exact same value as `VANL_BOT_API_SHARED_SECRET` in both the bot's
environment and the website's environment — they must match, since it's a
shared secret rather than a keypair.

---

# Server Setup

The bot runs as part of the NixOS host described in `../server/` — see the root `README.md` for
provisioning a fresh VPS, deploying, and the initial setup runbook (writing
`/etc/vanl/bot.env`, first restart, etc.). Nothing here needs to be run directly against `bot/`
on the server; `nixos-rebuild switch --target-host`, run from `../server/`, is the entire deploy
mechanism.

## First time link Signal device

Before the bot will work you need to link the new device (the server) to the Signal bot — see
"Link the bot to Signal" below. This must run as the `vanl-bot` system user
(`sudo -u vanl-bot env HOME=/var/lib/vanl-bot ...`), since that's the account `bot.service` and
`signal-daemon.service` both run as, and Signal's linked-device state
(`~/.local/share/signal-cli`) is tied to whichever `$HOME` did the linking.

---

# Deployment Workflow

`nixos-rebuild switch --target-host`, run from `../server/` (see the root `README.md`), is the
entire deploy story — for both infrastructure changes and new bot code. There's no separate
install step, no polling, no git pull on the server: `bot.service` execs a fully pre-built Nix
package (`bot`) directly, and `restartTriggers` restarts it automatically whenever that
package's contents change.

---

# Development

## Install precommit hooks

Once you're in a nix development shell run:

```sh
install-precommit-hooks
```

You should now have precommit hookt hat runs type checks, linters, formatters and unit tests before you are allowed to commit.

### Run the bot locally

Before the bot's signal daemon will work you need to link the new device (the machine you're on) to the Signal bot, see "Link the bot to Signal".

The easiest way to run everything locally is:

```sh
nix run .#dev
```

This starts the signal daemon in the background and the bot in the foreground against
`configs/dev.toml`, and stops the daemon again on Ctrl+C. It requires
`VANL_BOT_SIGNAL_ACCOUNT`, `VANL_SIGNUP_PRIVATE_KEY`, and `VANL_BOT_API_SHARED_SECRET` to already
be set (put them in `.envrc`) — it checks all three up front and refuses to start if any are
missing.

You can also run the two pieces separately. Run the signal daemon:

```sh
nix run .#signal-daemon -- --signal-acount +316... 
```

You can also make a $VANL_BOT_SIGNAL_ACCOUNT environment variable (put that in your .envrc), so that you never need to supply the phone number.

Then run the bot from a nix dev shell:

```sh
bot --config configs/dev.toml
```

---

# Signal Event Ingestion

Periodically reviews new messages in the configured Signal "events" group,
drafts/updates events on the website (as the `signal-bot` account, through
the same public API a human publisher uses — never a bypass) using a Claude
tool-use pass, and posts a review link to the configured admin group. See
`src/bot/message_archive_feature.py` (always-on capture), `src/bot/event_review_feature.py`
(periodic review), and `src/bot/event_mcp_server.py` (the tool surface both
of those, and Claude Desktop/Code, can drive).

Three config sections, all optional (disabled unless present):

- `[archive_db]` — connection details for the bot's own Postgres tables
  (`bot_archived_messages`/`bot_archived_attachments`/`bot_event_notifications`,
  `web/migrations/0012_bot_archive.sql`), reached via a narrowly-scoped
  `vanl_bot` Postgres role with no access to `events`/`users`/etc.
- `[message_archive_feature]` — `archived_groups`, the Signal group name(s)
  to watch.
- `[event_review_feature]` — `events_group_name`, `admin_group_name`,
  `website_base_url`, `anthropic_model`, and the review-timing knobs
  (`review_interval_seconds`, `message_action_delay_seconds`).

**Disabled in `configs/dev.toml` on purpose** — running this locally posts
real messages to whatever Signal group you point it at and calls a real
Anthropic API (real cost). To test it locally, add the three sections above
to a local copy of `configs/dev.toml` (not committed) pointing at scratch
Signal groups, and set `VANL_BOT_WEBSITE_API_TOKEN` (matching the website's
own env var of the same name), `VANL_BOT_DATABASE_PASSWORD` (matching the
`vanl_bot` Postgres role's password), and `ANTHROPIC_API_KEY`.

To manually trigger one review pass without waiting for the timer (useful
when testing), call `EventReviewFeature.run_review()` directly from a
throwaway script, or reduce `review_interval_seconds` for a dev run.

## Standalone MCP server

`event-mcp-server --config configs/prod.toml` runs the exact same tool
surface `event_review_feature.py` drives in-process, but standalone over
stdio — point Claude Desktop/Code at it for ad hoc queries over the
archive (e.g. "summarize last week's events chat"). Needs the same
signal-cli daemon, Postgres, and website API access as the bot itself.

## Typed website client

`src/bot/event_web_client.py` is a hand-written typed client for the subset
of the website's public API this feature calls, mirroring the Zod schemas
`web/scripts/generate-openapi.ts` derives `web/openapi.json` from. Wiring
`openapi-python-client generate --url ../web/openapi.json` into the dev
shell to replace it with a genuinely generated client — and keep both sides
honestly in sync via a CI/precommit check (`bun run check-openapi-fresh` on
the website side already exists for the spec itself) — is a documented
fast-follow, not required for this to work correctly now.

---

# Logs

View the bot logs:

```sh
journalctl -u bot.service -f
```

View the signal daemon logs:

```sh
journalctl -u signal-daemon.service -f
```

---

# Link the bot to Signal

The bot should run as a **linked device** on an existing Signal account. Do this once on the
server, as the `vanl-bot` system user (`sudo -u vanl-bot env HOME=/var/lib/vanl-bot ...`) —
`bot.service`/`signal-daemon.service` both run as that user, and Signal's linked-device state
must be set up under the same `$HOME`.

1. Generate a QR code on the server for the machine your're own. The server has no flake
   checkout, so use `vanl-bot-link` — a wrapper around `nix run .#link` that `../server/`'s
   `configuration.nix` puts on the VPS's `PATH` (see `environment.systemPackages` there):

```
sudo -u vanl-bot env HOME=/var/lib/vanl-bot vanl-bot-link --machine-name <MY-MACHINE-NAME>
```

   (For local development against a flake checkout, `nix run .#link -- --machine-name <NAME>`
   works the same way.)

If you don't see a QR code, because your terminal does not support graphic display, the take the `sgnl://` address and generate a QR Code to it. 

2. On your phone: Signal → Settings → Linked devices → **Link new device**, then scan the QR code.

3. The bot should now show up under linked devices in Signal. Signal state is stored under `~/.local/share/signal-cli`, so the same user must run the bot and the linking step.

---

# Troubleshooting

## Bot not starting

Check service status:

```
systemctl status bot.service
systemctl status signal-daemon.service
```

---

## Check logs

```
journalctl -u bot.service -n 100
journalctl -u signal-daemon.service -n 100
```

---

## Force a redeploy

Re-run `nixos-rebuild switch --target-host` from `../server/` (see the root `README.md`) — it's
idempotent, and always picks up the current state of `bot/` (including uncommitted local
changes).
