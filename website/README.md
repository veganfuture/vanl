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
`127.0.0.1:54329`, and creates the `vanl_dev` and `vanl_test` databases (the ones
`configs/dev.toml` and `configs/test.toml` point at). It's safe to run again — it no-ops if the
dev database is already running.

### Run migrations

```bash
VANL_CONFIG_PATH=configs/dev.toml VANL_DATABASE_PASSWORD= bun run migrate
```

(`VANL_DATABASE_PASSWORD` is empty because the dev database is started with `--auth=trust` —
password-less, loopback-only. Never do this in production.)

### Stop it

```bash
nix run .#devdb-stop
```

Data persists in `.devdb/` between stop/start — delete that directory to reset from scratch.

`nix run .#check` (and the `checkProject` app it wraps, see `flake.nix`) starts the dev database,
runs migrations, runs the test suite, and stops it again automatically — you don't need to do any
of the above by hand just to run `bun run test`.

### If the server won't start because it can't reach the database

The `postgres` client library connects lazily, so on its own a bad connection wouldn't surface
until the first request that happens to touch the database. To avoid that, a Nitro plugin
(`src/server/plugins/check-database-connection.ts`) runs a trivial query as soon as the server
boots and, if it fails, logs a `fatal` error explaining what happened and exits the process
immediately instead of starting up in a broken state. If you see a log line like:

```
Could not connect to the database — refusing to start. Is the dev Postgres instance running?
Start it with `nix run .#devdb-start`. See README.md, section "Database", for details.
```

it means Postgres isn't reachable at the `[database]` host/port in whichever config file
`VANL_CONFIG_PATH` points at — see "Start it" above, or check `configs/*.toml` and
`VANL_DATABASE_PASSWORD` if you're pointed at something other than the local dev database.

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
  `vite.config.ts`'s `nitro({ serverDir: "src/server" })`), e.g. the database connectivity check.
- `configs/` — non-secret TOML configuration per environment.
- `public/` — static assets served as-is (favicons, QR codes, manifest).

As the calendar itself is built out in later milestones, domain logic (events, organizations,
users) will live in its own top-level module rather than inside `routes/` or `components/` — see
`../docs/architecture.md` for the target domain model.
