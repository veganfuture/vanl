This is the VeganActivists.nl website, built with [SolidStart](https://start.solidjs.com) and
[Tailwind CSS](https://tailwindcss.com), running on [Bun](https://bun.sh).

See [`../docs`](../docs) for the overall architecture, domain model, and milestone plan.

## Getting started

### With Nix (recommended)

```bash
nix develop
```

This drops you into a shell with `bun`, `node`, and `nushell` available.

### Without Nix

Install Bun 1.3+ and Node 22+ yourself.

### Install dependencies

```bash
bun install
```

### Run the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server reads config from
`configs/dev.toml` by default (override with the `VANL_CONFIG_PATH` environment variable).

## Database

The site uses Postgres. For local development, `nix develop` gives you a `postgresql` binary and
a couple of helper commands that manage a throwaway Postgres instance living under `.devdb/`
(gitignored) — no system-wide Postgres install or Docker needed.

### Start it

```bash
nix run .#devdb-start
```

This initializes `.devdb/data` on first run, starts `postgres` listening on
`127.0.0.1:54329`, and creates the `vanl_dev` database (the one `configs/dev.toml` points at —
also used by `nix run .#check`'s test run, so keep that in mind if you have data in there you
care about; see below). It's safe to run again — it no-ops if the dev database is already
running.

### Run migrations

```bash
VANL_CONFIG_PATH=configs/dev.toml VANL_DATABASE_PASSWORD= bun run migrate
```

(`VANL_DATABASE_PASSWORD` is empty because the dev database is started with `--auth=trust` —
password-less, loopback-only. Never do this in production.)

### Check whether it's running

```bash
nix run .#devdb-status
```

Exits 0 and prints `Dev Postgres is running on 127.0.0.1:54329.` if it is; exits 1 with a
message otherwise.

### Stop it

```bash
nix run .#devdb-stop
```

Data persists in `.devdb/` between stop/start — delete that directory to reset from scratch.

`nix run .#check` (and the `checkProject` app it wraps, see `flake.nix`) starts the dev database,
runs migrations, runs the test suite, and stops it again automatically — you don't need to do any
of the above by hand just to run `bun run test`. Note that it runs against `configs/dev.toml`
(the same config and database as `bun run dev`), not a separate test database — test files
truncate shared tables in `beforeEach`, so running `nix run .#check` while you have data you care
about in your local dev database will wipe it.

### If the server won't start

`src/server/plugins/startup-checks.ts` (a Nitro plugin, so it runs once as soon as the server
boots, before it accepts any requests) fails fast instead of letting the first request that
happens to hit a problem be the one that discovers it:

- **Required environment variables** (currently just `VANL_BOT_API_SHARED_SECRET`, see
  "Environment Variables" below) are checked synchronously at startup.
- **Database connectivity**: the `postgres` client library connects lazily, so on its own a bad
  connection wouldn't surface until the first request that happens to touch the database. This
  plugin runs a trivial query instead and fails if it can't.

Either check logs a `fatal` error explaining what's missing/wrong and exits the process. If it's
the database, and you see:

```
Could not connect to the database — refusing to start. Is the dev Postgres instance running?
Start it with `nix run .#devdb-start`. See README.md, section "Database", for details.
```

it means Postgres isn't reachable at the `[database]` host/port in whichever config file
`VANL_CONFIG_PATH` points at — see "Start it" above, or check `configs/*.toml` and
`VANL_DATABASE_PASSWORD` if you're pointed at something other than the local dev database.

## Environment Variables

On top of `configs/*.toml`, the website reads one secret from the environment:

| Variable | Purpose |
| --- | --- |
| `VANL_BOT_API_SHARED_SECRET` | Authenticates this site's calls into the bot's local HTTP API (relaying OTP login codes over Signal). |

It must match the bot's own `VANL_BOT_API_SHARED_SECRET` — see `../bot/README.md`, section
"Environment Variables", for how to generate one and where it's used on the bot side.

## Configuration

All non-secret configuration lives in one TOML file — see `configs/dev.toml` and
`configs/prod.toml`. The file path is read from the `VANL_CONFIG_PATH` environment variable at
startup; secrets (once there are any) are passed via environment variables, never the TOML file.

## Verification

```bash
bun run format:check   # prettier
bun run lint           # eslint
bun run typecheck      # tsc --noEmit
bun run test           # vitest
bun run build          # production build
```

All five are also bundled as `nix run .#check` (see `flake.nix`).

## Deployment

`nix run .#install -- --config <path-to-toml>` installs `vanl-web.service` as a systemd unit,
mirroring how the Signal bot (`../bot`) is deployed. `nix run .#uninstall` removes it. Both require
`sudo` and are meant to be run on the target VPS, not in development.

## Project layout

- `src/routes/` — file-based routes (SolidStart convention: a file's path under `routes/` is its
  URL path).
- `src/components/` — shared UI components.
- `src/lib/` — domain-agnostic utilities: config loading (`config.ts`), logging (`logger.ts`),
  i18n (`i18n.ts`), and static data (`groups.ts`, `metadata.ts`).
- `src/server/plugins/` — Nitro plugins that run once at server startup (see
  `vite.config.ts`'s `nitro({ serverDir: "src/server" })`), e.g. `startup-checks.ts`.
- `configs/` — non-secret TOML configuration per environment.
- `public/` — static assets served as-is (favicons, QR codes, manifest).

As the calendar itself is built out in later milestones, domain logic (events, organizations,
users) will live in its own top-level module rather than inside `routes/` or `components/` — see
`../docs/architecture.md` for the target domain model.
