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
nix run .#dev
```

Starts the dev database (see below), seeds the `dev` user if `DEV_ACI` is set, runs
`bun run dev`, and stops the dev database again once you exit (Ctrl+C included). This is the
one-command way to get going — `package.json`'s `dev` script itself is deliberately just plain
`vite dev` and does none of that on its own; if you manage the database yourself (see below), you
can run `bun run dev` directly instead.

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
`127.0.0.1:54329`, and creates two databases in that same instance: `vanl_dev` (the one
`configs/dev.toml` points at — your interactive data lives here) and `vanl_test`
(`configs/test.toml` — what the test suite actually runs against, see below). It's safe to run
again — it no-ops if the dev database is already running.

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

### Open a psql prompt against it

```bash
nix run .#devdb-repl
```

Connects to `vanl_dev` as the `vanl` user. No password needed (same `--auth=trust` as above).

### Stop it

```bash
nix run .#devdb-stop
```

Data persists in `.devdb/` between stop/start — delete that directory to reset from scratch.

`nix run .#check` (and the `checkProject` app it wraps, see `flake.nix`) starts the dev database
and runs the test suite (plus format/lint/typecheck/build), stopping it again automatically — you
don't need to do any of the above by hand just to run `bun run test`. The test suite always runs
against `configs/test.toml`'s `vanl_test` database, not `vanl_dev` — `vitest.config.ts`'s
`test.env` forces this regardless of what `VANL_CONFIG_PATH` is already set to, and its
`globalSetup` migrates `vanl_test` automatically. Test files truncate shared tables in
`beforeEach`, but since that's a separate database, running `bun run test` or `nix run .#check`
never touches whatever data you have in your local `vanl_dev`.

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

On top of `configs/*.toml`, the website reads secrets from the environment:

| Variable | Purpose |
| --- | --- |
| `VANL_BOT_API_SHARED_SECRET` | Authenticates this site's calls into the bot's local HTTP API (relaying OTP login codes over Signal). |
| `DEV_ACI` | Optional, dev-only. Your own Signal ACI — if set, `bun run migrate` seeds a `dev` user with that ACI and grants it `site_admin`, so you can log in as yourself locally without going through signup. Unset in CI/prod; never commit it (put it in your own untracked `.envrc`). |

`VANL_BOT_API_SHARED_SECRET` must match the bot's own `VANL_BOT_API_SHARED_SECRET` — see
`../bot/README.md`, section "Environment Variables", for how to generate one and where it's used
on the bot side.

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
- `src/server/routes/` — Nitro's own (not SolidStart's) file-based routes, `h3`-style
  (`defineHandler`). Used instead of `src/routes/**` specifically for endpoints a browser fetches
  as a non-navigation sub-resource (`<img src>`, etc.) — a `src/routes/**` route for those 404s
  under `bun run dev` because of a Nitro dev-server quirk keyed on the `Sec-Fetch-Dest` request
  header, not the URL. See `src/server/routes/images/[sha256].get.ts`'s comment for the full story.
- `configs/` — non-secret TOML configuration per environment.
- `public/` — static assets served as-is (favicons, QR codes, manifest).

As the calendar itself is built out in later milestones, domain logic (events, organizations,
users) will live in its own top-level module rather than inside `routes/` or `components/` — see
`../docs/architecture.md` for the target domain model.
