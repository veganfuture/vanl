import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import type { ActingUser } from "~/lib/acting-user";
import type { OrgRole } from "./organization";
import { OrganizationRepository } from "./organization_repository";
import { OrganizationService, type OrganizationInput } from "./organization_service";

const authRepository = new AuthRepository(sql);
const repository = new OrganizationRepository(sql);
const service = new OrganizationService(repository, authRepository);

async function makeUser(accountName: string): Promise<UserId> {
  const result = (
    await authRepository.createUserFromSignup(
      {
        signalAci: SignalAci.from_string(crypto.randomUUID())._unsafeUnwrap(),
        accountName: AccountName.from_string(accountName)._unsafeUnwrap(),
        email: `${accountName}@example.com`,
        displayName: accountName,
        affiliationsNote: null,
      },
      crypto.randomUUID(),
    )
  )._unsafeUnwrap();
  if (result === "nonce_already_used") {
    throw new Error("unexpected nonce collision in test");
  }
  return result.id;
}

function actingAs(
  userId: UserId,
  isSiteAdmin = false,
  orgRoles: Record<string, OrgRole> = {},
): ActingUser {
  return { id: userId, isSiteAdmin, orgRoles: new Map(Object.entries(orgRoles)) };
}

function baseInput(overrides: Partial<OrganizationInput> = {}): OrganizationInput {
  return {
    name: `Test Org ${crypto.randomUUID()}`,
    description: null,
    websiteUrl: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await sql`truncate table events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

describe("createOrganization", () => {
  it("any authenticated user can create an org and becomes its sole org_admin", async () => {
    const creator = await makeUser("org-creator-service");

    const result = await service.createOrganization(
      actingAs(creator),
      baseInput({ name: "New Org" }),
    );

    const org = result._unsafeUnwrap();
    expect(org.name).toBe("New Org");
    const memberships = (await repository.listMemberships(org.id))._unsafeUnwrap();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("org_admin");
  });

  it("rejects an empty name", async () => {
    const creator = await makeUser("org-creator-empty-name");
    const result = await service.createOrganization(actingAs(creator), baseInput({ name: "   " }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a duplicate name", async () => {
    const creatorA = await makeUser("org-dup-name-a");
    const creatorB = await makeUser("org-dup-name-b");
    (
      await service.createOrganization(actingAs(creatorA), baseInput({ name: "Duplicate Org" }))
    )._unsafeUnwrap();

    const result = await service.createOrganization(
      actingAs(creatorB),
      baseInput({ name: "Duplicate Org" }),
    );

    expect(result._unsafeUnwrapErr()).toBe("name_taken");
  });
});

describe("updateOrganization", () => {
  it("an org_admin can update their org", async () => {
    const admin = await makeUser("org-update-service-admin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Updatable Org" }))
    )._unsafeUnwrap();

    const result = await service.updateOrganization(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
      baseInput({ name: "Updated Org Name" }),
    );

    expect(result._unsafeUnwrap().name).toBe("Updated Org Name");
  });

  it("an org_editor cannot update the org profile", async () => {
    const admin = await makeUser("org-update-forbid-admin");
    const editor = await makeUser("org-update-forbid-editor");
    const org = (
      await service.createOrganization(
        actingAs(admin),
        baseInput({ name: "Editor Cannot Edit Org" }),
      )
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, editor, "org_editor"))._unsafeUnwrap();

    const result = await service.updateOrganization(
      actingAs(editor, false, { [org.id.value]: "org_editor" }),
      org.id,
      baseInput(),
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("a non-member cannot update the org", async () => {
    const admin = await makeUser("org-update-stranger-admin");
    const stranger = await makeUser("org-update-stranger");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Stranger Cannot Edit" }))
    )._unsafeUnwrap();

    const result = await service.updateOrganization(actingAs(stranger), org.id, baseInput());

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("a site_admin can update any org", async () => {
    const admin = await makeUser("org-update-siteadmin-owner");
    const siteAdmin = await makeUser("org-update-siteadmin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Site Admin Editable" }))
    )._unsafeUnwrap();

    const result = await service.updateOrganization(
      actingAs(siteAdmin, true),
      org.id,
      baseInput({ name: "Renamed by site admin" }),
    );

    expect(result._unsafeUnwrap().name).toBe("Renamed by site admin");
  });
});

describe("deleteOrganization", () => {
  it("site_admin only - an org_admin cannot delete their own org", async () => {
    const admin = await makeUser("org-delete-org-admin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Cannot Self Delete" }))
    )._unsafeUnwrap();

    const result = await service.deleteOrganization(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("a site_admin can soft-delete an org", async () => {
    const admin = await makeUser("org-delete-target-admin");
    const siteAdmin = await makeUser("org-delete-siteadmin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Deletable Org" }))
    )._unsafeUnwrap();

    (await service.deleteOrganization(actingAs(siteAdmin, true), org.id))._unsafeUnwrap();

    expect((await repository.findOrganizationById(org.id))._unsafeUnwrap()?.status).toBe("deleted");
  });
});

describe("addMember", () => {
  it("an org_admin can add a member by account name", async () => {
    const admin = await makeUser("add-member-admin");
    const newMember = await makeUser("add-member-target");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Add Member Org" }))
    )._unsafeUnwrap();

    (
      await service.addMember(
        actingAs(admin, false, { [org.id.value]: "org_admin" }),
        org.id,
        "add-member-target",
        "org_editor",
      )
    )._unsafeUnwrap();

    const membership = (await repository.findMembership(org.id, newMember))._unsafeUnwrap();
    expect(membership?.role).toBe("org_editor");
  });

  it("rejects an unknown account name", async () => {
    const admin = await makeUser("add-member-unknown-admin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Unknown Account Org" }))
    )._unsafeUnwrap();

    const result = await service.addMember(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
      "no-such-account",
      "org_editor",
    );

    expect(result._unsafeUnwrapErr()).toBe("account_not_found");
  });

  it("rejects adding someone who's already a member", async () => {
    const admin = await makeUser("add-member-dup-admin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Dup Member Org" }))
    )._unsafeUnwrap();

    const result = await service.addMember(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
      "add-member-dup-admin",
      "org_editor",
    );

    expect(result._unsafeUnwrapErr()).toBe("already_member");
  });

  it("an org_editor cannot add members", async () => {
    const admin = await makeUser("add-member-forbid-admin");
    const editor = await makeUser("add-member-forbid-editor");
    const target = await makeUser("add-member-forbid-target");
    const org = (
      await service.createOrganization(
        actingAs(admin),
        baseInput({ name: "Editor Cannot Add Org" }),
      )
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, editor, "org_editor"))._unsafeUnwrap();

    const result = await service.addMember(
      actingAs(editor, false, { [org.id.value]: "org_editor" }),
      org.id,
      "add-member-forbid-target",
      "org_editor",
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
    expect((await repository.findMembership(org.id, target))._unsafeUnwrap()).toBeNull();
  });
});

describe("updateMemberRole / removeMember - the >=1 org_admin invariant", () => {
  it("refuses to demote the sole admin", async () => {
    const admin = await makeUser("service-sole-admin-demote");
    const org = (
      await service.createOrganization(
        actingAs(admin),
        baseInput({ name: "Sole Admin Demote Org" }),
      )
    )._unsafeUnwrap();

    const result = await service.updateMemberRole(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
      admin,
      "org_editor",
    );

    expect(result._unsafeUnwrapErr()).toBe("sole_admin");
  });

  it("refuses to remove the sole admin", async () => {
    const admin = await makeUser("service-sole-admin-remove");
    const org = (
      await service.createOrganization(
        actingAs(admin),
        baseInput({ name: "Sole Admin Remove Org" }),
      )
    )._unsafeUnwrap();

    const result = await service.removeMember(
      actingAs(admin, false, { [org.id.value]: "org_admin" }),
      org.id,
      admin,
    );

    expect(result._unsafeUnwrapErr()).toBe("sole_admin");
  });

  it("allows demoting an admin when another admin remains", async () => {
    const adminA = await makeUser("service-two-admins-a");
    const adminB = await makeUser("service-two-admins-b");
    const org = (
      await service.createOrganization(
        actingAs(adminA),
        baseInput({ name: "Two Admins Service Org" }),
      )
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, adminB, "org_admin"))._unsafeUnwrap();

    const result = await service.updateMemberRole(
      actingAs(adminA, false, { [org.id.value]: "org_admin" }),
      org.id,
      adminA,
      "org_editor",
    );

    expect(result.isOk()).toBe(true);
  });
});

describe("public reads", () => {
  it("getOrganizationBySlug and listOrganizations work without any acting user", async () => {
    const admin = await makeUser("public-read-admin");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Public Read Org" }))
    )._unsafeUnwrap();

    expect((await service.getOrganizationBySlug(org.slug))._unsafeUnwrap()?.id.equals(org.id)).toBe(
      true,
    );
    const listed = (await service.listOrganizations())._unsafeUnwrap().map((o) => o.id.value);
    expect(listed).toContain(org.id.value);
  });
});

describe("listMembershipDetails", () => {
  it("any member (either role) can view the roster", async () => {
    const admin = await makeUser("roster-view-admin");
    const editor = await makeUser("roster-view-editor");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Roster View Org" }))
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, editor, "org_editor"))._unsafeUnwrap();

    const result = await service.listMembershipDetails(
      actingAs(editor, false, { [org.id.value]: "org_editor" }),
      org.id,
    );

    expect(result._unsafeUnwrap()).toHaveLength(2);
  });

  it("a non-member cannot view the roster", async () => {
    const admin = await makeUser("roster-forbidden-admin");
    const stranger = await makeUser("roster-forbidden-stranger");
    const org = (
      await service.createOrganization(actingAs(admin), baseInput({ name: "Roster Forbidden Org" }))
    )._unsafeUnwrap();

    const result = await service.listMembershipDetails(actingAs(stranger), org.id);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });
});
