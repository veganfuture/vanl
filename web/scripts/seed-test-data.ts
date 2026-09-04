import postgres from "postgres";
import { loadConfig } from "../src/lib/config";

/**
 * Dev-only convenience: upserts a handful of fixed test users and test
 * organizations (with memberships), so local dev/manual testing has more
 * to work with than the single DEV_ACI-based `dev` user seed-dev-user.ts
 * creates - a plain non-admin user, and an org_admin/org_editor pair split
 * across two orgs so both single- and cross-org permission boundaries have
 * something to click through. Signal ACIs are fixed, obviously-fake UUIDs -
 * never real Signal accounts, safe to commit and share across every
 * checkout. Idempotent - safe to re-run (upserts keyed on account_name /
 * organization name, same style as seed-dev-user.ts).
 */

type TestUser = {
  signalAci: string;
  accountName: string;
  email: string;
  displayName: string;
};

const TEST_USER: TestUser = {
  signalAci: "10000000-0000-4000-8000-000000000001",
  accountName: "test-user",
  email: "test-user@example.com",
  displayName: "Test User",
};

const TEST_ORG_ADMIN: TestUser = {
  signalAci: "10000000-0000-4000-8000-000000000002",
  accountName: "test-org-admin",
  email: "test-org-admin@example.com",
  displayName: "Test Org Admin",
};

const TEST_ORG_EDITOR: TestUser = {
  signalAci: "10000000-0000-4000-8000-000000000003",
  accountName: "test-org-editor",
  email: "test-org-editor@example.com",
  displayName: "Test Org Editor",
};

type TestOrg = {
  name: string;
  slug: string;
  descriptionNl: string;
  descriptionEn: string;
};

const TEST_ORG_ONE: TestOrg = {
  name: "Test Org One",
  slug: "test-org-one",
  descriptionNl: "Testorganisatie voor lokale ontwikkeling/testen.",
  descriptionEn: "Fixture organization for local dev/testing.",
};

const TEST_ORG_TWO: TestOrg = {
  name: "Test Org Two",
  slug: "test-org-two",
  descriptionNl: "Tweede testorganisatie, voor het testen van grenzen tussen organisaties.",
  descriptionEn: "Second fixture organization, for testing cross-org boundaries.",
};

async function upsertUser(sql: postgres.Sql, user: TestUser): Promise<string> {
  const [row] = await sql`
    insert into users (signal_aci, account_name, email, display_name)
    values (${user.signalAci}, ${user.accountName}, ${user.email}, ${user.displayName})
    on conflict (account_name) do update set signal_aci = excluded.signal_aci
    returning id
  `;
  return row.id as string;
}

async function upsertOrg(sql: postgres.Sql, org: TestOrg): Promise<string> {
  const [row] = await sql`
    insert into organizations (name, slug, description_nl, description_en)
    values (${org.name}, ${org.slug}, ${org.descriptionNl}, ${org.descriptionEn})
    on conflict (name) do update set
      description_nl = excluded.description_nl,
      description_en = excluded.description_en
    returning id
  `;
  return row.id as string;
}

async function upsertMembership(
  sql: postgres.Sql,
  orgId: string,
  userId: string,
  role: "org_admin" | "org_editor",
): Promise<void> {
  await sql`
    insert into organization_memberships (org_id, user_id, role)
    values (${orgId}, ${userId}, ${role})
    on conflict (org_id, user_id) do update set role = excluded.role
  `;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  try {
    await upsertUser(sql, TEST_USER);
    const orgAdminId = await upsertUser(sql, TEST_ORG_ADMIN);
    const orgEditorId = await upsertUser(sql, TEST_ORG_EDITOR);

    const orgOneId = await upsertOrg(sql, TEST_ORG_ONE);
    const orgTwoId = await upsertOrg(sql, TEST_ORG_TWO);

    await upsertMembership(sql, orgOneId, orgAdminId, "org_admin");
    await upsertMembership(sql, orgOneId, orgEditorId, "org_editor");
    await upsertMembership(sql, orgTwoId, orgEditorId, "org_admin");

    console.log("Seeded test users:");
    console.log(`  ${TEST_USER.accountName} (plain user, no org membership)`);
    console.log(`  ${TEST_ORG_ADMIN.accountName} (org_admin of "${TEST_ORG_ONE.name}")`);
    console.log(
      `  ${TEST_ORG_EDITOR.accountName} (org_editor of "${TEST_ORG_ONE.name}", org_admin of "${TEST_ORG_TWO.name}")`,
    );
    console.log(`Seeded test organizations: "${TEST_ORG_ONE.name}", "${TEST_ORG_TWO.name}"`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
