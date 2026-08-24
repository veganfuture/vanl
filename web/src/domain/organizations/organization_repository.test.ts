import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import { OrganizationRepository, type NewOrganizationInput } from "./organization_repository";

const authRepository = new AuthRepository(sql);
const repository = new OrganizationRepository(sql);

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

function baseOrgInput(overrides: Partial<NewOrganizationInput> = {}): NewOrganizationInput {
  return {
    name: `Test Org ${crypto.randomUUID()}`,
    slug: `test-org-${crypto.randomUUID()}`,
    description: null,
    websiteUrl: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await sql`truncate table events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("createOrganizationWithAdmin", () => {
  it("creates the org and its creator's admin membership atomically", async () => {
    const admin = await makeUser("org-creator");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Atomic Org" }), admin)
    )._unsafeUnwrap();

    expect(org.name).toBe("Atomic Org");
    expect(org.status).toBe("active");

    const memberships = (await repository.listMemberships(org.id))._unsafeUnwrap();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].userId.equals(admin)).toBe(true);
    expect(memberships[0].role).toBe("org_admin");
  });
});

describe("lookups", () => {
  it("finds an org by id and by slug", async () => {
    const admin = await makeUser("org-lookup-admin");
    const created = (
      await repository.createOrganizationWithAdmin(
        baseOrgInput({ name: "Lookup Org", slug: "lookup-org" }),
        admin,
      )
    )._unsafeUnwrap();

    expect((await repository.findOrganizationById(created.id))._unsafeUnwrap()?.slug).toBe(
      "lookup-org",
    );
    expect(
      (await repository.findOrganizationBySlug("lookup-org"))
        ._unsafeUnwrap()
        ?.id.equals(created.id),
    ).toBe(true);
  });

  it("returns null for a slug that does not exist", async () => {
    expect((await repository.findOrganizationBySlug("nonexistent"))._unsafeUnwrap()).toBeNull();
  });

  it("only lists active orgs", async () => {
    const admin = await makeUser("org-status-admin");
    const active = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Active Org" }), admin)
    )._unsafeUnwrap();
    const deleted = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Deleted Org" }), admin)
    )._unsafeUnwrap();
    (await repository.setOrganizationStatus(deleted.id, "deleted"))._unsafeUnwrap();

    const listed = (await repository.listActiveOrganizations())
      ._unsafeUnwrap()
      .map((o) => o.id.value);
    expect(listed).toContain(active.id.value);
    expect(listed).not.toContain(deleted.id.value);
  });
});

describe("updateOrganization", () => {
  it("updates the editable fields", async () => {
    const admin = await makeUser("org-update-admin");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Old Name" }), admin)
    )._unsafeUnwrap();

    const updated = (
      await repository.updateOrganization(org.id, {
        name: "New Name",
        description: "A description now",
        websiteUrl: "https://example.org",
      })
    )._unsafeUnwrap();

    expect(updated.name).toBe("New Name");
    expect(updated.description).toBe("A description now");
    expect(updated.websiteUrl).toBe("https://example.org");
  });
});

describe("membership sole-admin guards", () => {
  it("allows demoting an admin when another admin remains", async () => {
    const adminA = await makeUser("sole-admin-demote-a");
    const adminB = await makeUser("sole-admin-demote-b");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Two Admins Org" }), adminA)
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, adminB, "org_admin"))._unsafeUnwrap();

    const outcome = (
      await repository.updateMembershipRoleUnlessSoleAdmin(org.id, adminA, "org_editor")
    )._unsafeUnwrap();

    expect(outcome).toBe("updated");
    const membership = (await repository.findMembership(org.id, adminA))._unsafeUnwrap();
    expect(membership?.role).toBe("org_editor");
  });

  it("refuses to demote the sole admin", async () => {
    const admin = await makeUser("sole-admin-demote-only");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "One Admin Org" }), admin)
    )._unsafeUnwrap();

    const outcome = (
      await repository.updateMembershipRoleUnlessSoleAdmin(org.id, admin, "org_editor")
    )._unsafeUnwrap();

    expect(outcome).toBe("sole_admin");
    const membership = (await repository.findMembership(org.id, admin))._unsafeUnwrap();
    expect(membership?.role).toBe("org_admin");
  });

  it("refuses to remove the sole admin", async () => {
    const admin = await makeUser("sole-admin-remove-only");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Sole Remove Org" }), admin)
    )._unsafeUnwrap();

    const outcome = (
      await repository.removeMembershipUnlessSoleAdmin(org.id, admin)
    )._unsafeUnwrap();

    expect(outcome).toBe("sole_admin");
    expect((await repository.findMembership(org.id, admin))._unsafeUnwrap()).not.toBeNull();
  });

  it("allows removing a non-admin member freely", async () => {
    const admin = await makeUser("editor-remove-admin");
    const editor = await makeUser("editor-remove-editor");
    const org = (
      await repository.createOrganizationWithAdmin(
        baseOrgInput({ name: "Editor Remove Org" }),
        admin,
      )
    )._unsafeUnwrap();
    (await repository.addMembership(org.id, editor, "org_editor"))._unsafeUnwrap();

    const outcome = (
      await repository.removeMembershipUnlessSoleAdmin(org.id, editor)
    )._unsafeUnwrap();

    expect(outcome).toBe("removed");
    expect((await repository.findMembership(org.id, editor))._unsafeUnwrap()).toBeNull();
  });
});

describe("listMembershipDetails", () => {
  it("joins membership rows with account info", async () => {
    const admin = await makeUser("membership-detail-admin");
    const org = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Detail Org" }), admin)
    )._unsafeUnwrap();

    const details = (await repository.listMembershipDetails(org.id))._unsafeUnwrap();

    expect(details).toHaveLength(1);
    expect(details[0].accountName).toBe("membership-detail-admin");
    expect(details[0].role).toBe("org_admin");
  });
});

describe("listMembershipsForUser", () => {
  it("returns every org (and role) a user belongs to", async () => {
    const user = await makeUser("multi-org-user");
    const orgA = (
      await repository.createOrganizationWithAdmin(baseOrgInput({ name: "Multi Org A" }), user)
    )._unsafeUnwrap();
    const otherAdmin = await makeUser("multi-org-other-admin");
    const orgB = (
      await repository.createOrganizationWithAdmin(
        baseOrgInput({ name: "Multi Org B" }),
        otherAdmin,
      )
    )._unsafeUnwrap();
    (await repository.addMembership(orgB.id, user, "org_editor"))._unsafeUnwrap();

    const memberships = (await repository.listMembershipsForUser(user))._unsafeUnwrap();
    const byOrg = new Map(memberships.map((m) => [m.orgId, m.role]));

    expect(byOrg.get(orgA.id.value)).toBe("org_admin");
    expect(byOrg.get(orgB.id.value)).toBe("org_editor");
  });
});
