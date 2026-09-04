import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "./account_name";
import { actingAs } from "./acting_user.test-helpers";
import { AuthRepository } from "./auth_repository";
import { SignalAci } from "./signal_aci";
import type { UserId } from "./user_id";
import { listAdminUserSummaries } from "./admin_users";
import { OrganizationRepository } from "../organizations/organization_repository";

const authRepository = new AuthRepository(sql);
const organizationRepository = new OrganizationRepository(sql);

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

beforeEach(async () => {
  await sql`truncate table images, events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

describe("listAdminUserSummaries", () => {
  it("is forbidden for a non-site-admin", async () => {
    const userId = await makeUser("regular");
    const result = await listAdminUserSummaries(actingAs(userId, false));
    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("aggregates account name, last login, and org memberships for every user", async () => {
    const admin = await makeUser("admin");
    const orgAdminUser = await makeUser("orgadmin");
    const orgEditorUser = await makeUser("orgeditor");
    await makeUser("lonely");

    const org = (
      await organizationRepository.createOrganizationWithAdmin(
        {
          name: "Test Org",
          slug: `test-org-${crypto.randomUUID()}`,
          description: null,
          websiteUrl: null,
        },
        orgAdminUser,
      )
    )._unsafeUnwrap();
    (
      await organizationRepository.addMembership(org.id, orgEditorUser, "org_editor")
    )._unsafeUnwrap();

    const loginAt = new Date("2026-01-01T12:00:00Z");
    (
      await authRepository.insertSession({
        userId: orgAdminUser,
        tokenHash: `test-hash-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
    )._unsafeUnwrap();
    // insertSession always uses now() for created_at, so overwrite it directly to assert an exact lastLoginAt.
    await sql`update sessions set created_at = ${loginAt} where user_id = ${orgAdminUser.value}`;

    const result = await listAdminUserSummaries(actingAs(admin, true));
    const summaries = result._unsafeUnwrap();

    const byAccountName = new Map(summaries.map((s) => [s.accountName.value, s]));

    expect(byAccountName.get("orgadmin")?.lastLoginAt).toEqual(loginAt);
    expect(byAccountName.get("orgadmin")?.organizations).toEqual([
      { orgId: org.id.value, orgName: "Test Org", role: "org_admin" },
    ]);

    expect(byAccountName.get("orgeditor")?.lastLoginAt).toBeNull();
    expect(byAccountName.get("orgeditor")?.organizations).toEqual([
      { orgId: org.id.value, orgName: "Test Org", role: "org_editor" },
    ]);

    expect(byAccountName.get("lonely")?.lastLoginAt).toBeNull();
    expect(byAccountName.get("lonely")?.organizations).toEqual([]);

    expect(summaries).toHaveLength(4);
  });
});
