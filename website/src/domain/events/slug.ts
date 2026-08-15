import { randomBytes } from "node:crypto";

const MAX_TITLE_SLUG_LENGTH = 60;

// Unicode combining diacritical marks (U+0300-U+036F), stripped after NFKD
// normalization so accented letters degrade to their base letter rather
// than being dropped outright. Built via RegExp(string) rather than a
// /.../ literal so the source file stays plain ASCII instead of embedding
// raw combining characters.
const COMBINING_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Immutable, human-readable-title + short random suffix (milestones.md's
 * "lower-stakes defaults"). The random suffix - not the title text - is
 * what actually guarantees uniqueness, so this never needs a retry loop or
 * a uniqueness check before insert; a DB-level unique constraint is the
 * real enforcement, same philosophy as signup_nonces/sessions tokens.
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TITLE_SLUG_LENGTH);
  const suffix = randomBytes(4).toString("hex");
  return base ? `${base}-${suffix}` : suffix;
}
