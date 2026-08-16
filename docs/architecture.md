# VANL Calendar — Architecture

Status: proposed, pending review. Companion documents: [threat-model.md](./threat-model.md), [milestones.md](./milestones.md).

## 1. Recommended architecture

A single SolidStart application (SSR + islands of client interactivity) running on Bun, backed by one PostgreSQL database, deployed to a single Ubuntu VPS via Nix + systemd, fronted by Cloudflare. The existing Python Signal bot is extended with one new feature (signed signup URLs) and a small localhost-only REST endpoint the website calls to send Signal messages (OTP codes, signup confirmations). No containers, no microservices, no message queue — the read-heavy, write-light workload of a regional events calendar does not justify that complexity.

### Alternatives considered

- **Next.js instead of SolidStart** — rejected per spec; the current site is being migrated away from Next.js deliberately.
- **Separate API server + SPA frontend** — rejected. SolidStart gives SSR and API routes in one deployable unit; splitting them would add a second service to build, deploy, and secure for no MVP benefit. Revisit only if the website ever needs to serve a genuinely separate API consumer.
- **ORM (Prisma/Drizzle) instead of hand-written SQL** — rejected per spec, and independently preferred: ORMs have a well-known failure mode of hidden N+1 queries, generated SQL diverging from what you'd write by hand, and schema drift against migrations. Chosen instead: hand-written parameterized SQL via [`postgres.js`](https://github.com/porsager/postgres) (tagged-template-literal queries, built-in connection pooling), behind repositories, with results validated into typed rows at the query boundary. Guardrail: keep repository functions single-purpose and concrete — resist growing an informal query-builder inside the repository layer, which would just reinvent a worse ORM.
- **Managed Postgres (RDS/Neon/etc.) instead of self-hosted on the VPS** — self-hosted chosen to match the bot's existing Nix/systemd operational model and avoid a second billing relationship; revisit if operational burden becomes a problem.
- **JWT/stateless sessions instead of server-side sessions** — rejected. Server-side session rows are required to support revocation (logout-everywhere, account deletion, admin-forced logout); see ADR in milestones.md.

## 2. Domain model

All primary keys are surrogate UUIDs. Business-facing identifiers (`account_name`, event/org `slug`) are unique but never used as the database primary key.

### User
- `id` (uuid, pk)
- `signal_aci` (uuid, unique, not null, immutable) — enforces "one user per ACI"
- `account_name` (citext, unique, not null, immutable after creation)
- `email` (text, not null, unverified, not unique)
- `display_name` (text, not null)
- `affiliations_note` (text, nullable, private — never rendered publicly)
- `created_at`, `updated_at`
- `deleted_at` (nullable) — tombstone marker; see account deletion below

### GlobalRole
- `user_id` (fk), `role` (enum: `site_admin`) — separate table, not a column on `User`. "Editor" is not a stored role: any non-deleted `User` implicitly has editor capabilities per the MVP spec. This keeps the door open for a future vetting step without a migration.

### Session
- `id` (uuid, pk), `user_id` (fk), `token_hash` (the cookie holds the opaque token; only its hash is stored), `created_at`, `expires_at` (24h from creation), `revoked_at` (nullable)

### LoginChallenge (OTP)
- `id`, `user_id`, `code_hash`, `attempts_remaining` (starts at 3), `expires_at` (short-lived, minutes not hours), `created_at`

### SignupNonce
- `nonce` (pk, from the bot-signed URL), `used_at` (nullable) — enforces single-use on bot-signed signup links. No bot-side storage needed; the bot only signs, the website tracks single-use.

### Organization
- `id`, `name` (citext, unique), `slug` (unique, immutable), `description`, `website_url` (nullable, validated), `logo_full_image_id`, `logo_thumbnail_image_id` (nullable fks — 400px/160px variants), `status` (enum: `active`, `deleted`), `created_at`, `updated_at`

### OrganizationMembership
- `org_id`, `user_id` (composite pk), `role` (enum: `org_editor`, `org_admin`), `created_at`
- Invariant enforced in the application layer within a transaction: every organization has ≥1 `org_admin` at all times (demoting/removing the last admin, or the last admin deleting their account, must be rejected).

### Province
- Postgres enum, 12 fixed values (Drenthe, Flevoland, Friesland, Gelderland, Groningen, Limburg, Noord-Brabant, Noord-Holland, Overijssel, Utrecht, Zeeland, Zuid-Holland). Never changes; no lookup table needed.

### Place (canonical `woonplaats`)
- `id`, `name`, `municipality_name`, `province` (enum), `source_id` (external CBS/PDOK identifier)
- Seeded once from the official CBS/PDOK "Woonplaatsen" dataset via a versioned import script, not user-editable. This is the canonical geographic unit for filtering; see [milestones.md](./milestones.md) ADR-3.

### Event
*Ships incrementally per the milestone plan: Milestone 3 introduces this table with individual publishing only (`publisher_user_id`, not-null); Milestone 5 adds `publisher_org_id` and the exactly-one-publisher `CHECK` once Organizations exist; Milestone 6 wires up the flyer image fields. The shape below is the target state.*

- `id`, `slug` (unique, immutable, human-readable-title + short random suffix)
- `title_nl`, `title_en`, `description_nl`, `description_en` (bilingual - a publisher fills in either language or both; `CHECK` requires at least one of each pair non-null. Display prefers the viewer's current locale, falling back to whichever language is present - an event is always shown regardless of which language it was written in.)
- `start_at` (timestamptz, stored as unix epoch, entered/rendered in `Europe/Amsterdam`)
- `end_at` (nullable, same rules; validated `end_at > start_at` when present)
- `location_kind` (enum: `precise_address`, `meeting_point_city_only`)
- `place_id` (fk to Place, not null — every event has at least a canonical city; for `precise_address`, resolved server-side from the PDOK address lookup rather than chosen directly by the publisher)
- `location_description` (text, not null — free text for `meeting_point_city_only`; for `precise_address` it's the PDOK-resolved address string, since the PDOK free-text search is the only way a publisher specifies that kind of location)
- `map_url` (nullable, validated URL)
- `external_event_url`, `registration_url` (nullable, validated URLs)
- `organizer_name` (nullable text; which real-world organization runs the event, e.g. "Anonymous for the Voiceless" — only ever set by an import script's own heuristics at creation, never by a human publisher or a later edit)
- `flyer_full_image_id`, `flyer_preview_image_id`, `flyer_thumbnail_image_id` (nullable fks — 1600px/600px/160px variants; the thumbnail is a dedicated small variant rather than shipping the 600px preview just to crop it down client-side, and matches Organization's logo_thumbnail_image_id width so an event's own flyer thumbnail and its organizer's logo thumbnail — the fallback when the event has none — look consistent side-by-side in a list)
- `publisher_user_id` XOR `publisher_org_id` (exactly one set — enforced by `CHECK`)
- `publisher_user_visible` (boolean; only meaningful when `publisher_user_id` is set)
- `status` (enum: `hidden`, `visible`, `cancelled`)
- `cancel_reason` (nullable text; only meaningful when `status = cancelled`)
- `is_featured` (boolean, site-admin only; effective featured state additionally requires `start_at > now()`, computed at query time — no scheduled job needed to "unfeature")
- `source` (enum: `manual`, `signal_import`, `animalrightscalendar.com` — the latter set by `scripts/import-arc-events.ts`)
- `external_source_id` (nullable text; together with `source`, unique — makes re-running an import script an idempotent upsert)
- `recurrence_rule` (nullable jsonb, **unused in MVP** — reserved extension point per the recurring-events decision)
- `created_by`, `updated_by` (fk User, not null)
- `created_at`, `updated_at`

Events are hard-deleted on explicit user/admin action (not soft-deleted) — per spec, deletion is for never-seen or duplicate events; true cancellations use `status = cancelled` instead. Suggest logging deletions (slug, deleted_by, timestamp) to the application log for accountability without keeping the row live.

### Image
- `sha256` (pk), `bytes`, `mime`, `width`, `height`, `created_at`
- Kept in its own table so ordinary event/org listing queries never fetch image bytes, per spec. Content-addressed, immutable, served at `/images/{sha256}.webp` with long-lived cache headers.

## 3. Permission matrix

"Editor" and "User" are the same actual capability set in the MVP (every registered account is automatically an editor) but are kept conceptually distinct for a future vetting step.

| Capability | Visitor | User | Editor | Org editor | Org admin | Site admin |
|---|---|---|---|---|---|---|
| View public events, filter/search | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View organization profiles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update own profile | | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete own account | | ✅ | ✅ | ✅ (unless sole org admin) | ✅ (unless sole org admin) | ✅ |
| Create event published as self | | | ✅ | ✅ | ✅ | ✅ |
| Edit/delete/cancel own event | | | ✅ | ✅ | ✅ | ✅ |
| Create organization (becomes its org admin) | | | ✅ | ✅ | ✅ | ✅ |
| Create event on behalf of an org (member of) | | | | ✅ | ✅ | ✅ |
| Edit/delete own org event | | | | ✅ | ✅ | ✅ |
| Edit/delete *any* event of that org | | | | | ✅ | ✅ |
| Edit org profile | | | | | ✅ | ✅ |
| Add/remove org members, promote/demote | | | | | ✅ | ✅ |
| Delete organization | | | | | | ✅ |
| Administer any user/org (create, edit, promote, delete) | | | | | | ✅ |
| Feature/unfeature events | | | | | | ✅ |

All checks are backend-enforced at the repository/domain-service boundary; frontend visibility is never treated as authorization.

## 4. Rendering and caching strategy

- **Public pages** (calendar list, event detail, organization profile, landing page, the two migrated marketing pages): SSR'd, `Cache-Control` set for shared caches (short `s-maxage` + `stale-while-revalidate`), fronted by Cloudflare honoring those headers. Filter state lives in the URL query string so filtered views are independently cacheable and shareable.
- **Authenticated/admin pages**: never cached by a shared cache — explicit `Cache-Control: private, no-store` and Cloudflare configured to bypass cache whenever a session cookie is present.
- **Images**: content-addressed, `Cache-Control: public, max-age=31536000, immutable`.
- **Reliability**: pages that don't need the database (the two static marketing pages, robots.txt, health check) must not depend on it at all. DB-backed public pages use `stale-if-error` so Cloudflare/reverse-proxy can keep serving the last good response if Postgres is briefly unavailable.
- No ISR/complex regeneration pipeline for MVP, per spec's "do not add a complex caching system until the access patterns require it" — short TTL + CDN is the whole strategy until proven insufficient.

## 5. Deployment topology

- One Ubuntu VPS. Systemd units: `vanl-web.service` (SolidStart/Bun), the existing bot service (unchanged tech stack, new REST endpoint added), `vanl-backup.service` + `.timer`.
- Postgres runs on the same VPS (or an adjacent one if load later requires it — not needed for MVP).
- Cloudflare terminates public TLS and acts as CDN/reverse proxy in front of the origin; origin also serves HTTPS.
- Website → bot communication is a REST call over `localhost` (or an internal-only address), never exposed to the internet, authenticated with a shared secret passed via environment variable, and scoped to a narrow set of message-sending operations (OTP, signup confirmation) — not a general "send arbitrary message" endpoint.
- `nix run .#install` lays down the systemd unit(s) for the website, mirroring the bot's existing `flake.nix` pattern.
- Single TOML config file on disk; secrets via `EnvironmentFile=` in the systemd unit, never committed (repo is public on GitHub).

## 6. Backup and restore plan

- Nightly `pg_dump` (custom format) via a systemd timer, uploaded to S3-compatible object storage off-server. Because images are stored as `bytea` rows in Postgres, a single dump captures the entire application state (including uploaded flyers/logos) — this is the reason for storing images in the database rather than a separate object-storage path for MVP.
- Retention: e.g. 14 daily dumps + longer-interval weekly/monthly retention, kept simple for MVP and revisited once real storage costs are known.
- Restore runbook: fetch latest dump from S3 → `pg_restore` into a fresh database → run migrations if the dump predates a schema change → smoke-test (health check + a handful of read queries) before pointing the app at it. This runbook should be written down and drilled at least once before go-live, not left theoretical.
- Past-event retention/archival is a distinct future policy decision, explicitly not an accidental consequence of the backup mechanism.
