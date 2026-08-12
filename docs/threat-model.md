# VANL Calendar — Threat model

Status: proposed, pending review. See also [architecture.md](./architecture.md).

## Key assets

- **User PII**: email, affiliations note, and above all the Signal ACI ↔ account linkage. This is the most sensitive asset in the system — deanonymizing an activist (linking their real Signal identity to public activism) is a genuine safety risk in this domain (surveillance/harassment risk from opposing interests), not just a generic privacy concern.
- **Session credentials** (cookies).
- **The bot's ability to send Signal messages** — if the website can trigger arbitrary bot messages, that's a spam/abuse vector against the wider Signal community, not just this app.
- **Event/organization content integrity** — a defaced or falsified event (wrong time/location, fake cancellation) can send real people to the wrong place or make them miss a real action.
- **Uploaded images** — may embed EXIF GPS data pinpointing where a photo was taken.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Forged/replayed signup link creates an account under someone else's identity | Bot signs the signup payload (ACI + nonce + expiry); website verifies the signature, checks expiry, and marks the nonce used (single-use) before allowing account creation |
| Session hijacking (cookie theft) | HttpOnly, Secure, SameSite cookies; TLS everywhere; 24h hard expiry; server-side session records so any session can be revoked (logout-everywhere, admin-forced logout, account deletion) |
| OTP brute force at login | 3 attempts per challenge, short challenge expiry, rate-limited challenge creation per account and per IP |
| Compromised website process abuses the bot to spam Signal users | Website→bot channel is localhost-only, shared-secret authenticated, and scoped to specific message types (OTP, signup confirmation) — not a general "send any message" capability |
| Privilege escalation to `site_admin` via a normal editable field | Global roles live in a separate table, never derived from user-editable profile data; bootstrap only via explicit config or a controlled admin action |
| Authorization bypass via direct API/route calls (frontend-only checks) | All authorization enforced in backend domain services, tested independently of the UI, per the milestone review checklist |
| Cross-organization data leakage (org editor of org A reading/editing org B's data) | Repository queries scoped by explicit membership checks, never by trusting client-supplied org IDs alone |
| Stored XSS via event descriptions, cancel reasons, org bios | Escape/sanitize all user-supplied rich text on render; CSP headers |
| Malicious or oversized image upload (decompression bombs, disguised file types, GPS-in-EXIF leakage) | Upload size limit enforced before decode; decode and verify genuine image type before trusting it; reject absurd pixel dimensions; strip all EXIF (including GPS) on re-encode to webp — this also protects publishers who photograph their own meeting point |
| Enumeration/guessing of hidden events or internal IDs | Public URLs use opaque slugs over non-sequential surrogate UUID PKs; hidden events return a plain 404, not a 403 that would confirm existence |
| Secrets leaking via the public GitHub repo | Secrets only ever passed via environment variables / systemd `EnvironmentFile`, never committed; consider a secret-scanning pre-commit hook matching the bot's existing setup |
| Abusive crawling / scraping driving up load or cost | Request-rate limits, body-size limits, connection limits, timeouts, cached anonymous GETs, `robots.txt`, Cloudflare in front of origin |
| Database outage taking down the whole site | Static pages and health checks don't depend on the DB at all; DB-backed public pages degrade to `stale-if-error` cached responses rather than hard failure |
| A malicious event publisher lists a real person's address as a "meeting point" without consent, or otherwise weaponizes the calendar for harassment | Out of full technical scope for MVP — mitigated operationally by site-admin hide/delete power and the visible-publisher-identity model (publisher accountable for what they post); flagged here as a known residual risk rather than solved, since no report/flag feature is planned for MVP |
