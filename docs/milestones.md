# VANL Calendar — Milestones, decisions, and non-goals

Status: proposed, pending review. See also [architecture.md](./architecture.md), [threat-model.md](./threat-model.md).

## Decisions that are expensive to reverse (ADRs)

1. **SolidStart + Bun + Nix + Postgres, no containers.** Mandated by the spec; recorded here because it constrains every later choice.
2. **Hand-written parameterized SQL via `postgres.js` behind repositories, no ORM/query builder; results are validated into typed rows at the query boundary.** Chosen partly to avoid well-known ORM pain (hidden N+1s, generated SQL diverging from hand-written intent, schema drift). Affects every data-access line from Milestone 2 onward — switching later means rewriting the entire data layer.
3. **`woonplaats` (place), not `gemeente` (municipality), as the canonical geography unit**, seeded once from the official CBS/PDOK dataset, with province filtering derived through the place→province relationship. Switching the canonical unit later requires re-seeding and remapping every existing event.
4. **Surrogate UUID primary keys everywhere, with separate immutable slugs for events and organizations.** Foundational to safe migrations and stable public URLs; retrofitting after real data exists is painful.
5. **Global roles (`site_admin`) modeled in a separate table from organization-scoped roles — no single "role" column on `User`.** Foundational to the authorization model; retrofitting later is effectively an authz rewrite.
6. **Server-side sessions (opaque cookie token, hashed row in DB) rather than stateless JWTs.** Chosen specifically so sessions can be revoked (logout-everywhere, account deletion, admin-forced logout). Switching to JWTs later reintroduces the revocation problem.
7. **Bot-signed, single-use, expiring signup URLs; the bot stays stateless (only signs), single-use tracking lives on the website.** Establishes the trust boundary between bot and website. Changing this after real users have onboarded is a breaking change to the signup flow.
8. **Recurring events are explicitly out of MVP scope**, with only a reserved, unused `recurrence_rule` column on `Event`. Listed for contrast: this one is *cheap* to reverse later precisely because nothing is built on top of it yet.

Lower-stakes defaults, recorded so they don't need to be re-litigated per milestone (flag any you disagree with):

- `account_name` is immutable after account creation.
- Organization `name` uniqueness is case-insensitive (`citext`).
- Slugs are `title-derived-text` + a short random suffix.
- A hidden event's direct URL returns a plain 404.
- Locale is path-prefixed (`/nl`, `/en`), matching the current site — not `Accept-Language` negotiation, to stay cache-friendly.
- Images are stored as Postgres `bytea` for MVP (see architecture.md §6 for why); moving to S3-backed object storage later is a bounded, self-contained migration since images already live in their own content-addressed table.
- Concrete rate-limit numbers are chosen and documented as an ADR when Milestone 7 (caching/crawler protection) is implemented, not pre-specified here.
- Moderation for MVP is site-admin manual hide/delete only; no report/flag feature.

## Explicit MVP non-goals

- Event RSVP'ing.
- Signal event-message ingestion (LLM-parsed prefill from the events group) — a followup project.
- Bidirectional feed with animalrightscalendar.com.
- Scraping any external source.
- Recommendation features.
- Native mobile apps (site is mobile-first web, not a native app).
- Ticket sales / payment processing.
- Online-only events.
- Recurring event rules (extension point reserved, not implemented).
- Automated/community content moderation (report/flag features).
- Events outside the Netherlands (explicitly disallowed, not just deprioritized).
- A public, third-party-facing REST API.

## Milestone plan

Each milestone is independently runnable and reviewable; acceptance criteria are restated at kickoff per the spec's workflow, since implementation detail may sharpen them. The database is deliberately *not* stood up until it's needed (M2) and is then extended milestone by milestone rather than schema-designed upfront — there's no production data yet, so no migration-compatibility concerns, only forward `ALTER`s as each milestone needs new tables/columns.

**M1 — SolidStart migration.**
Nix flake + dev shell, Bun-based SolidStart skeleton, TOML config loader (site-level settings only), structured logging, error boundary producing a reportable error code, formatter/typecheck/test pipeline in CI, `nix run .#install` producing a systemd unit. Migrate the two existing static NL/EN marketing pages from Next.js to SolidStart to prove SSR + i18n routing with real content. No Postgres, no auth, no events — this milestone pulls in nothing beyond what's needed to serve those two pages, and doubles as proof that DB-independent pages truly don't depend on the database (architecture.md §4).

**M2 — Signal-based authentication.**
First milestone to introduce Postgres: `postgres.js`, migration tooling, and only the tables auth needs — `User`, `GlobalRole`, `Session`, `LoginChallenge`, `SignupNonce` (architecture.md §2). Repository pattern established here, with unit tests against a real test Postgres instance. Bot: implement the signed-signup-URL feature in `bot_feature.py`. Website: signup flow (verify signature, enforce single-use/expiry, account creation form), login flow (account name → OTP via bot → 3-attempt verification → session), session middleware, "remembered account name" convenience cookie, site-admin bootstrap via config. Tests cover signature verification, replay rejection, OTP attempt limits, and session expiry.

**M3 — Events core.**
Extends the schema with `Event`, `Place`, `Province` (canonical geography seeded here, since every event needs a city). Publishing is individual-only at this stage — `publisher_org_id` and the exactly-one-publisher constraint arrive in M5. Event CRUD, the location model (canonical place + free-text description), status transitions (hidden/visible/cancelled + optional reason), delete-with-confirmation flow, slug generation, and validation rules for end times/URLs/geographic fields. Basic (unfiltered) public event detail page and listing. Authorization tests for the individual-publisher rows of the permission matrix.

**M4 — Public calendar browsing.**
City/province filtering with URL-reflected state, infinite scroll, landing page with featured events and the site-admin featuring UI, past-event exclusion with archive access, SEO/social metadata (including Signal link previews), full NL/EN coverage of all public pages built so far.

**M5 — Organizations.**
Adds `Organization`, `OrganizationMembership`. CRUD, membership management (add/remove/promote/demote by account name), the "≥1 org admin" invariant, public organization profile page. Extends `Event`: `publisher_org_id`, the exactly-one-publisher `CHECK`, org-authored event creation, and org-scoped edit/delete rules (`org_editor` own-events-only, `org_admin` all-org-events). Authorization tests for the remaining organization/org-event rows of the permission matrix.

**M6 — Images.**
Adds `Image`. Upload pipeline: decode, validate genuine image type, strip EXIF, resize, re-encode to webp; immutable content-addressed URLs with long-lived cache headers; flyer (1600/600) variants wired onto `Event` and logo (400/160) variants wired onto `Organization`; upload UI with size/dimension guidance.

**M7 — Caching, crawler protection & reliability hardening.**
Cache-header audit across all public routes built so far, rate limits / body-size limits / connection limits / timeouts, `robots.txt`, `stale-while-revalidate`/`stale-if-error` behavior, verification that authenticated responses never leak into shared caches.

**M8 — Backups & deployment hardening.**
Automated nightly `pg_dump` + S3 upload via systemd timer, a written and drilled restore runbook, production deployment documentation, final systemd/logging/monitoring review.

## Unresolved-question log

Resolved during spec review (kept here for traceability, not re-open unless something changes):
- Publishing identity contradiction ("and/or" vs "exactly one") — resolved: exactly one.
- Featured-event caching conflict ("random order on reload") — resolved: line removed from spec.
- Raw-SQL vs typed results — resolved: hand-written SQL, typed at the repository boundary (ADR-2).
- Geography model (municipality vs place, canonical vs free-text) — resolved: canonical `woonplaats` (ADR-3).
- Self-service account deletion / GDPR — resolved: anonymize-on-delete, tombstone retained for referential integrity, events preserved (see architecture.md §2 User/Event notes).
- Recurring events — resolved: out of MVP scope, extension point reserved (ADR-8).

Still open, to revisit if they turn out to matter before the relevant milestone:
- Whether all-day/multi-day events (no fixed clock start time) are needed — not addressed yet; low risk to defer since it only affects Milestone 3's validation rules and is additive.
- Exact rate-limit numbers (Milestone 8).
- Long-term image storage location (DB vs S3) beyond MVP.
