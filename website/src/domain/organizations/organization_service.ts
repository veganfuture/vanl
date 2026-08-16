import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import { AuthRepository } from "~/domain/auth/auth_repository";
import type { UserId } from "~/domain/auth/user_id";
import { isUniqueViolation, sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { generateSlug } from "~/lib/slug";
import type { ActingUser } from "~/lib/acting-user";
import type { Organization, OrganizationMembershipDetail, OrgRole } from "./organization";
import { OrganizationId } from "./organization_id";
import { OrganizationRepository, type EditableOrganizationFields } from "./organization_repository";

/**
 * Same shape whether creating or updating - trimming/validation mirrors
 * event_service.ts's EventInput/EventInputSchema split (shape coercion here,
 * business rules kept minimal since Organization has far fewer of them).
 */
export type OrganizationInput = {
  name: string;
  description: string | null;
  websiteUrl: string | null;
};

const nullableTrimmed = z
  .string()
  .nullable()
  .transform((v) => v?.trim() || null);

const OrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: nullableTrimmed,
  websiteUrl: z.string().trim().url().nullable(),
});

export type CreateOrganizationError = "validation" | "name_taken" | "internal_error";
export type UpdateOrganizationError =
  "not_found" | "forbidden" | "validation" | "name_taken" | "internal_error";
export type DeleteOrganizationError = "not_found" | "forbidden" | "internal_error";
export type ListMembersError = "forbidden" | "internal_error";
export type AddMemberError =
  "org_not_found" | "account_not_found" | "already_member" | "forbidden" | "internal_error";
export type UpdateMemberRoleError =
  "org_not_found" | "member_not_found" | "forbidden" | "sole_admin" | "internal_error";
export type RemoveMemberError =
  "org_not_found" | "member_not_found" | "forbidden" | "sole_admin" | "internal_error";

export class OrganizationService {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  /** Any authenticated user may create an organization - they become its sole org_admin (permission matrix §3). */
  createOrganization(
    actingUser: ActingUser,
    input: OrganizationInput,
  ): ResultAsync<Organization, CreateOrganizationError> {
    const parsed = OrganizationInputSchema.safeParse(input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error }, "organization creation rejected: invalid input");
      return errAsync("validation");
    }

    return this.repository
      .createOrganizationWithAdmin(
        {
          name: parsed.data.name,
          slug: generateSlug(parsed.data.name),
          description: parsed.data.description,
          websiteUrl: parsed.data.websiteUrl,
        },
        actingUser.id,
      )
      .mapErr((dbError): CreateOrganizationError => {
        if (isUniqueViolation(dbError.cause)) {
          logger.warn({ name: parsed.data.name }, "organization creation rejected: name taken");
          return "name_taken";
        }
        logger.error({ err: dbError }, "failed to create organization");
        return "internal_error";
      });
  }

  /** Public - no auth required (permission matrix §3: visitors can view organization profiles). */
  getOrganizationBySlug(slug: string): ResultAsync<Organization | null, never> {
    return this.repository.findOrganizationBySlug(slug).orElse((dbError) => {
      logger.error({ err: dbError }, "failed to look up organization by slug");
      return okAsync(null);
    });
  }

  /** Public listing - active orgs only. */
  listOrganizations(): ResultAsync<Organization[], never> {
    return this.repository.listActiveOrganizations().orElse((dbError) => {
      logger.error({ err: dbError }, "failed to list organizations");
      return okAsync([]);
    });
  }

  /** Every org actingUser belongs to (any role) - "my organizations", and the EventForm org selector. */
  listMyOrganizations(actingUser: ActingUser): ResultAsync<Organization[], never> {
    const orgIds = [...actingUser.orgRoles.keys()];
    if (orgIds.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.combine(
      orgIds.map((id) => {
        const orgIdResult = OrganizationId.from_string(id);
        if (orgIdResult.isErr()) {
          return okAsync<Organization | null, never>(null);
        }
        return this.repository.findOrganizationById(orgIdResult.value).orElse(() => okAsync(null));
      }),
    ).map((orgs) => orgs.filter((org): org is Organization => org !== null));
  }

  /** Any member (either role) can see the roster, or site_admin - listing isn't a mutation, so it's a lighter gate than requireOrgAdmin. */
  listMembershipDetails(
    actingUser: ActingUser,
    orgId: OrganizationId,
  ): ResultAsync<OrganizationMembershipDetail[], ListMembersError> {
    if (!actingUser.isSiteAdmin && !actingUser.orgRoles.has(orgId.value)) {
      return errAsync("forbidden");
    }
    return this.repository.listMembershipDetails(orgId).mapErr((dbError): ListMembersError => {
      logger.error({ err: dbError }, "failed to list membership details");
      return "internal_error";
    });
  }

  updateOrganization(
    actingUser: ActingUser,
    orgId: OrganizationId,
    input: OrganizationInput,
  ): ResultAsync<Organization, UpdateOrganizationError> {
    return this.requireOrgAdmin(actingUser, orgId, "not_found").andThen(() => {
      const parsed = OrganizationInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.warn({ err: parsed.error }, "organization update rejected: invalid input");
        return errAsync<Organization, UpdateOrganizationError>("validation");
      }
      const fields: EditableOrganizationFields = {
        name: parsed.data.name,
        description: parsed.data.description,
        websiteUrl: parsed.data.websiteUrl,
      };
      return this.repository.updateOrganization(orgId, fields).mapErr((dbError) => {
        if (isUniqueViolation(dbError.cause)) {
          return "name_taken" as const;
        }
        logger.error({ err: dbError }, "failed to update organization");
        return "internal_error" as const;
      });
    });
  }

  /** site_admin only - soft delete, per the permission matrix's "Delete organization" row. */
  deleteOrganization(
    actingUser: ActingUser,
    orgId: OrganizationId,
  ): ResultAsync<void, DeleteOrganizationError> {
    if (!actingUser.isSiteAdmin) {
      return errAsync("forbidden");
    }
    return this.repository
      .findOrganizationById(orgId)
      .mapErr((dbError): DeleteOrganizationError => {
        logger.error({ err: dbError }, "failed to look up organization for deletion");
        return "internal_error";
      })
      .andThen((org): ResultAsync<Organization, DeleteOrganizationError> =>
        org ? okAsync(org) : errAsync("not_found"),
      )
      .andThen(() =>
        this.repository.setOrganizationStatus(orgId, "deleted").mapErr((dbError) => {
          logger.error({ err: dbError }, "failed to delete organization");
          return "internal_error" as const;
        }),
      )
      .map(() => undefined);
  }

  /** org_admin/site_admin only - resolves the target by account name (same lookup AuthService.startLogin already uses). */
  addMember(
    actingUser: ActingUser,
    orgId: OrganizationId,
    accountNameRaw: string,
    role: OrgRole,
  ): ResultAsync<void, AddMemberError> {
    return this.requireOrgAdmin(actingUser, orgId, "org_not_found").andThen(() =>
      this.authRepository
        .findUserByAccountName(accountNameRaw.trim())
        .mapErr((dbError): AddMemberError => {
          logger.error({ err: dbError }, "failed to look up account for org membership");
          return "internal_error";
        })
        .andThen((user) => {
          if (!user) {
            return errAsync<never, AddMemberError>("account_not_found");
          }
          return this.repository
            .findMembership(orgId, user.id)
            .mapErr((dbError): AddMemberError => {
              logger.error({ err: dbError }, "failed to check existing membership");
              return "internal_error";
            })
            .andThen((existing) => {
              if (existing) {
                return errAsync<never, AddMemberError>("already_member");
              }
              return this.repository
                .addMembership(orgId, user.id, role)
                .mapErr((dbError): AddMemberError => {
                  logger.error({ err: dbError }, "failed to add member");
                  return "internal_error";
                });
            });
        }),
    );
  }

  updateMemberRole(
    actingUser: ActingUser,
    orgId: OrganizationId,
    memberUserId: UserId,
    role: OrgRole,
  ): ResultAsync<void, UpdateMemberRoleError> {
    return this.requireOrgAdmin(actingUser, orgId, "org_not_found").andThen(() =>
      this.repository
        .updateMembershipRoleUnlessSoleAdmin(orgId, memberUserId, role)
        .mapErr((dbError): UpdateMemberRoleError => {
          logger.error({ err: dbError }, "failed to update member role");
          return "internal_error";
        })
        .andThen((outcome) =>
          outcome === "sole_admin"
            ? errAsync<void, UpdateMemberRoleError>("sole_admin")
            : okAsync<void, UpdateMemberRoleError>(undefined),
        ),
    );
  }

  removeMember(
    actingUser: ActingUser,
    orgId: OrganizationId,
    memberUserId: UserId,
  ): ResultAsync<void, RemoveMemberError> {
    return this.requireOrgAdmin(actingUser, orgId, "org_not_found").andThen(() =>
      this.repository
        .removeMembershipUnlessSoleAdmin(orgId, memberUserId)
        .mapErr((dbError): RemoveMemberError => {
          logger.error({ err: dbError }, "failed to remove member");
          return "internal_error";
        })
        .andThen((outcome) =>
          outcome === "sole_admin"
            ? errAsync<void, RemoveMemberError>("sole_admin")
            : okAsync<void, RemoveMemberError>(undefined),
        ),
    );
  }

  /**
   * org_admin of orgId, or site_admin - the gate for every
   * membership/profile-editing action. Public: ImageService reuses this
   * exact check for logo uploads rather than re-implementing it.
   */
  requireOrgAdmin<NotFoundTag extends string>(
    actingUser: ActingUser,
    orgId: OrganizationId,
    notFoundError: NotFoundTag,
  ): ResultAsync<void, NotFoundTag | "forbidden" | "internal_error"> {
    if (actingUser.isSiteAdmin) {
      return okAsync(undefined);
    }
    if (actingUser.orgRoles.get(orgId.value) !== "org_admin") {
      return errAsync("forbidden");
    }
    return this.repository
      .findOrganizationById(orgId)
      .mapErr((dbError): NotFoundTag | "forbidden" | "internal_error" => {
        logger.error({ err: dbError }, "failed to look up organization");
        return "internal_error";
      })
      .andThen((org) =>
        org
          ? okAsync<void, NotFoundTag | "forbidden" | "internal_error">(undefined)
          : errAsync<void, NotFoundTag | "forbidden" | "internal_error">(notFoundError),
      );
  }
}

export const organizationService = new OrganizationService(
  new OrganizationRepository(sql),
  new AuthRepository(sql),
);
