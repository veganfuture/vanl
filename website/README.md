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
- `configs/` — non-secret TOML configuration per environment.
- `public/` — static assets served as-is (favicons, QR codes, manifest).

As the calendar itself is built out in later milestones, domain logic (events, organizations,
users) will live in its own top-level module rather than inside `routes/` or `components/` — see
`../docs/architecture.md` for the target domain model.
