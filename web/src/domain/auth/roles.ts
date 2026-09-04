/**
 * Single source of truth for role literals - both the TS union and the
 * runtime array zod schemas validate against (z.enum(ORG_ROLES) instead of
 * every call site redeclaring z.enum(["org_editor", "org_admin"])).
 */
export const GLOBAL_ROLES = ["site_admin"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const ORG_ROLES = ["org_editor", "org_admin"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
