import { err, ok, ResultAsync, type Result } from "neverthrow";
import type postgres from "postgres";
import { z } from "zod";
import { sql } from "~/lib/db";
import { UserId } from "../auth/user_id";
import type {
  Organization,
  OrganizationStatus,
  OrgRole,
  OrganizationMembership,
  OrganizationMembershipDetail,
} from "./organization";
import { OrganizationId } from "./organization_id";

/**
 * Repositories are the only code in this project allowed to write SQL - see
 * auth_repository.ts for the fuller rationale (also applies here).
 */

export type DbError = { readonly message: string; readonly cause: unknown };

const OrganizationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  website_url: z.string().nullable(),
  logo_full_image_id: z.string().nullable(),
  logo_thumbnail_image_id: z.string().nullable(),
  status: z.enum(["active", "deleted"]),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

function mapOrganizationRow(row: unknown): Result<Organization, DbError> {
  const parsedRow = OrganizationRowSchema.safeParse(row);
  if (!parsedRow.success) {
    return err({
      message: `Corrupt organizations row: ${parsedRow.error.message}`,
      cause: parsedRow.error,
    });
  }
  const parsed = parsedRow.data;

  const idResult = OrganizationId.from_string(parsed.id);
  if (idResult.isErr()) {
    return err({
      message: `Corrupt organizations row: ${idResult.error.message}`,
      cause: idResult.error,
    });
  }

  return ok({
    id: idResult.value,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description,
    websiteUrl: parsed.website_url,
    logoFullImageId: parsed.logo_full_image_id,
    logoThumbnailImageId: parsed.logo_thumbnail_image_id,
    status: parsed.status,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

const MembershipRowSchema = z.object({
  org_id: z.string(),
  user_id: z.string(),
  role: z.enum(["org_editor", "org_admin"]),
  created_at: z.coerce.date(),
});

function mapMembershipRow(row: unknown): Result<OrganizationMembership, DbError> {
  const parsedRow = MembershipRowSchema.safeParse(row);
  if (!parsedRow.success) {
    return err({
      message: `Corrupt organization_memberships row: ${parsedRow.error.message}`,
      cause: parsedRow.error,
    });
  }
  const parsed = parsedRow.data;

  const userIdResult = UserId.from_string(parsed.user_id);
  if (userIdResult.isErr()) {
    return err({
      message: `Corrupt organization_memberships row: ${userIdResult.error.message}`,
      cause: userIdResult.error,
    });
  }

  return ok({
    orgId: parsed.org_id,
    userId: userIdResult.value,
    role: parsed.role,
    createdAt: parsed.created_at,
  });
}

const MembershipDetailRowSchema = MembershipRowSchema.extend({
  account_name: z.string(),
  display_name: z.string(),
});

function mapMembershipDetailRow(row: unknown): Result<OrganizationMembershipDetail, DbError> {
  const parsedRow = MembershipDetailRowSchema.safeParse(row);
  if (!parsedRow.success) {
    return err({
      message: `Corrupt organization_memberships row: ${parsedRow.error.message}`,
      cause: parsedRow.error,
    });
  }
  const parsed = parsedRow.data;

  const userIdResult = UserId.from_string(parsed.user_id);
  if (userIdResult.isErr()) {
    return err({
      message: `Corrupt organization_memberships row: ${userIdResult.error.message}`,
      cause: userIdResult.error,
    });
  }

  return ok({
    orgId: parsed.org_id,
    userId: userIdResult.value,
    role: parsed.role,
    createdAt: parsed.created_at,
    accountName: parsed.account_name,
    displayName: parsed.display_name,
  });
}

export type NewOrganizationInput = {
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
};

export type EditableOrganizationFields = {
  name: string;
  description: string | null;
  websiteUrl: string | null;
};

export class OrganizationRepository {
  constructor(private readonly sql: postgres.Sql) {}

  /**
   * Every organization must have >=1 org_admin at all times, so creation and
   * the creator's own admin membership happen in one transaction - never a
   * window where the org row exists with zero members (same reasoning as
   * the sole-admin-guard methods below).
   */
  createOrganizationWithAdmin(
    input: NewOrganizationInput,
    adminUserId: UserId,
  ): ResultAsync<Organization, DbError> {
    return ResultAsync.fromPromise(
      this.sql.begin(async (tx) => {
        const rows = await tx`
          insert into organizations (name, slug, description, website_url)
          values (${input.name}, ${input.slug}, ${input.description}, ${input.websiteUrl})
          returning *
        `;
        await tx`
          insert into organization_memberships (org_id, user_id, role)
          values (${rows[0].id}, ${adminUserId.value}, 'org_admin')
        `;
        return rows[0];
      }),
      (cause): DbError => ({ message: "Failed to create organization", cause }),
    ).andThen((row) => mapOrganizationRow(row));
  }

  findOrganizationById(id: OrganizationId): ResultAsync<Organization | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from organizations where id = ${id.value}`,
      (cause): DbError => ({ message: "Failed to find organization by id", cause }),
    ).andThen((rows): Result<Organization | null, DbError> =>
      rows[0] ? mapOrganizationRow(rows[0]) : ok(null),
    );
  }

  findOrganizationBySlug(slug: string): ResultAsync<Organization | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from organizations where slug = ${slug}`,
      (cause): DbError => ({ message: "Failed to find organization by slug", cause }),
    ).andThen((rows): Result<Organization | null, DbError> =>
      rows[0] ? mapOrganizationRow(rows[0]) : ok(null),
    );
  }

  /** Public listing - active orgs only. */
  listActiveOrganizations(): ResultAsync<Organization[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from organizations where status = 'active' order by name asc`,
      (cause): DbError => ({ message: "Failed to list organizations", cause }),
    ).andThen((rows) => {
      const mapped: Organization[] = [];
      for (const row of rows) {
        const result = mapOrganizationRow(row);
        if (result.isErr()) {
          return err<Organization[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  updateOrganization(
    id: OrganizationId,
    fields: EditableOrganizationFields,
  ): ResultAsync<Organization, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update organizations set
          name = ${fields.name},
          description = ${fields.description},
          website_url = ${fields.websiteUrl},
          updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to update organization", cause }),
    ).andThen((rows) => mapOrganizationRow(rows[0]));
  }

  /** Soft delete - orgs are never hard-deleted (unlike events), so member/event history stays intact. */
  setOrganizationStatus(
    id: OrganizationId,
    status: OrganizationStatus,
  ): ResultAsync<Organization, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update organizations set status = ${status}, updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to set organization status", cause }),
    ).andThen((rows) => mapOrganizationRow(rows[0]));
  }

  /** Repoints both logo variants at once - a dedicated narrow update, not part of the general edit form. */
  setOrganizationLogo(
    id: OrganizationId,
    fullImageId: string,
    thumbnailImageId: string,
  ): ResultAsync<Organization, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update organizations set
          logo_full_image_id = ${fullImageId},
          logo_thumbnail_image_id = ${thumbnailImageId},
          updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to set organization logo", cause }),
    ).andThen((rows) => mapOrganizationRow(rows[0]));
  }

  // --- Memberships ---

  listMemberships(orgId: OrganizationId): ResultAsync<OrganizationMembership[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from organization_memberships where org_id = ${orgId.value} order by created_at asc
      `,
      (cause): DbError => ({ message: "Failed to list memberships", cause }),
    ).andThen((rows) => {
      const mapped: OrganizationMembership[] = [];
      for (const row of rows) {
        const result = mapMembershipRow(row);
        if (result.isErr()) {
          return err<OrganizationMembership[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  /** Same as listMemberships, joined with account_name/display_name - for the membership-management UI. */
  listMembershipDetails(
    orgId: OrganizationId,
  ): ResultAsync<OrganizationMembershipDetail[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select m.org_id, m.user_id, m.role, m.created_at, u.account_name, u.display_name
        from organization_memberships m
        join users u on u.id = m.user_id
        where m.org_id = ${orgId.value}
        order by m.created_at asc
      `,
      (cause): DbError => ({ message: "Failed to list membership details", cause }),
    ).andThen((rows) => {
      const mapped: OrganizationMembershipDetail[] = [];
      for (const row of rows) {
        const result = mapMembershipDetailRow(row);
        if (result.isErr()) {
          return err<OrganizationMembershipDetail[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  /** Every org (and role) a user belongs to - feeds ActingUser.orgRoles. */
  listMembershipsForUser(userId: UserId): ResultAsync<OrganizationMembership[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from organization_memberships where user_id = ${userId.value}`,
      (cause): DbError => ({ message: "Failed to list memberships for user", cause }),
    ).andThen((rows) => {
      const mapped: OrganizationMembership[] = [];
      for (const row of rows) {
        const result = mapMembershipRow(row);
        if (result.isErr()) {
          return err<OrganizationMembership[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  findMembership(
    orgId: OrganizationId,
    userId: UserId,
  ): ResultAsync<OrganizationMembership | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from organization_memberships
        where org_id = ${orgId.value} and user_id = ${userId.value}
      `,
      (cause): DbError => ({ message: "Failed to find membership", cause }),
    ).andThen((rows): Result<OrganizationMembership | null, DbError> =>
      rows[0] ? mapMembershipRow(rows[0]) : ok(null),
    );
  }

  addMembership(orgId: OrganizationId, userId: UserId, role: OrgRole): ResultAsync<void, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into organization_memberships (org_id, user_id, role)
        values (${orgId.value}, ${userId.value}, ${role})
      `,
      (cause): DbError => ({ message: "Failed to add membership", cause }),
    ).map(() => undefined);
  }

  /**
   * Demoting an org_admin to org_editor must never leave an org with zero
   * admins - the check-then-act happens inside one transaction, with `for
   * update` locking the other admin rows being counted, so two concurrent
   * demotions of different admins can't both see "someone else is still
   * admin" and race each other down to zero (same transaction-scoped
   * invariant style as AuthRepository.createUserFromSignup's first-user
   * bootstrap check).
   */
  updateMembershipRoleUnlessSoleAdmin(
    orgId: OrganizationId,
    userId: UserId,
    role: OrgRole,
  ): ResultAsync<"updated" | "sole_admin", DbError> {
    return ResultAsync.fromPromise(
      this.sql.begin(async (tx) => {
        if (role === "org_editor") {
          // count(*) can't be combined with FOR UPDATE (Postgres rejects
          // locking clauses on aggregate queries) - lock the candidate rows
          // themselves and count what came back instead.
          const otherAdmins = await tx`
            select user_id from organization_memberships
            where org_id = ${orgId.value} and role = 'org_admin' and user_id != ${userId.value}
            for update
          `;
          if (otherAdmins.length === 0) {
            return "sole_admin" as const;
          }
        }
        await tx`
          update organization_memberships set role = ${role}
          where org_id = ${orgId.value} and user_id = ${userId.value}
        `;
        return "updated" as const;
      }),
      (cause): DbError => ({ message: "Failed to update membership role", cause }),
    );
  }

  /** Same sole-admin guard as updateMembershipRoleUnlessSoleAdmin, for removal instead of demotion. */
  removeMembershipUnlessSoleAdmin(
    orgId: OrganizationId,
    userId: UserId,
  ): ResultAsync<"removed" | "sole_admin", DbError> {
    return ResultAsync.fromPromise(
      this.sql.begin(async (tx) => {
        const existingRows = await tx`
          select role from organization_memberships
          where org_id = ${orgId.value} and user_id = ${userId.value}
        `;
        if (existingRows[0]?.role === "org_admin") {
          const otherAdmins = await tx`
            select user_id from organization_memberships
            where org_id = ${orgId.value} and role = 'org_admin' and user_id != ${userId.value}
            for update
          `;
          if (otherAdmins.length === 0) {
            return "sole_admin" as const;
          }
        }
        await tx`
          delete from organization_memberships
          where org_id = ${orgId.value} and user_id = ${userId.value}
        `;
        return "removed" as const;
      }),
      (cause): DbError => ({ message: "Failed to remove membership", cause }),
    );
  }
}

export const organizationRepository = new OrganizationRepository(sql);
