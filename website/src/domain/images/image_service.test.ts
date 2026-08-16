import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { sql } from "~/lib/db";
import type { ActingUser } from "~/lib/acting-user";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import type { OrgRole } from "../organizations/organization";
import { OrganizationId } from "../organizations/organization_id";
import { OrganizationRepository } from "../organizations/organization_repository";
import type { EventInput } from "../events/event_service";
import { eventService } from "../events/event_service";
import { EventId } from "../events/event_id";
import { imageService } from "./image_service";

const authRepository = new AuthRepository(sql);
const organizationRepository = new OrganizationRepository(sql);

let testPlaceId: string;

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

/** Creates an org with `adminUserId` as its sole org_admin, returning its id as a plain string (matches ActingUser.orgRoles' key type). */
async function makeOrg(name: string, adminUserId: UserId): Promise<string> {
  const org = (
    await organizationRepository.createOrganizationWithAdmin(
      { name, slug: `${name}-${crypto.randomUUID()}`, description: null, websiteUrl: null },
      adminUserId,
    )
  )._unsafeUnwrap();
  return org.id.value;
}

async function addOrgMember(orgId: string, userId: UserId, role: OrgRole): Promise<void> {
  const orgIdValue = OrganizationId.from_string(orgId)._unsafeUnwrap();
  (await organizationRepository.addMembership(orgIdValue, userId, role))._unsafeUnwrap();
}

function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    titleNl: null,
    titleEn: "Test Event",
    descriptionNl: null,
    descriptionEn: "A test event",
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endAt: null,
    locationKind: "meeting_point_city_only",
    placeId: testPlaceId,
    locationDescription: "Somewhere in town",
    pdokAddressId: null,
    mapUrl: null,
    externalEventUrl: null,
    registrationUrl: null,
    orgId: null,
    ...overrides,
  };
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 150, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  // A distinct name from other test files' own places fixtures - places
  // isn't truncated between files, and event_service.ts resolves some
  // lookups by municipality name, so a shared name here would make those
  // other tests' place resolution ambiguous.
  const rows = await sql`
    insert into places (name, municipality_name, province, source_id)
    values ('Image Service Fixture City', 'Image Service Fixture City', 'Utrecht', 'test-fixture-place-image-service')
    on conflict (source_id) do update set name = excluded.name
    returning id
  `;
  testPlaceId = rows[0].id as string;
});

beforeEach(async () => {
  await sql`truncate table images, events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("replaceEventFlyer", () => {
  it("the event's publisher can upload a flyer, producing three distinct variants", async () => {
    const publisher = await makeUser("flyer-publisher");
    const event = (
      await eventService.createEvent(actingAs(publisher), eventInput())
    )._unsafeUnwrap();
    const bytes = await makeJpeg(2000, 1200);

    const result = await imageService.replaceEventFlyer(actingAs(publisher), event.id, bytes);

    const updated = result._unsafeUnwrap();
    expect(updated.flyerFullImageId).not.toBeNull();
    expect(updated.flyerPreviewImageId).not.toBeNull();
    expect(updated.flyerThumbnailImageId).not.toBeNull();
    const ids = new Set([
      updated.flyerFullImageId,
      updated.flyerPreviewImageId,
      updated.flyerThumbnailImageId,
    ]);
    expect(ids.size).toBe(3);

    const thumbnail = (
      await sql`select width, height from images where sha256 = ${updated.flyerThumbnailImageId}`
    )[0];
    expect(thumbnail.width).toBe(160);
  });

  it("a stranger cannot upload a flyer to someone else's event", async () => {
    const publisher = await makeUser("flyer-owner");
    const stranger = await makeUser("flyer-stranger");
    const event = (
      await eventService.createEvent(actingAs(publisher), eventInput())
    )._unsafeUnwrap();
    const bytes = await makeJpeg(400, 400);

    const result = await imageService.replaceEventFlyer(actingAs(stranger), event.id, bytes);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("rejects a non-image upload without touching the event", async () => {
    const publisher = await makeUser("flyer-garbage-publisher");
    const event = (
      await eventService.createEvent(actingAs(publisher), eventInput())
    )._unsafeUnwrap();

    const result = await imageService.replaceEventFlyer(
      actingAs(publisher),
      event.id,
      Buffer.from("not an image"),
    );

    expect(result._unsafeUnwrapErr()).toBe("validation");
    const reloaded = (
      await eventService.loadForModification(actingAs(publisher), event.id)
    )._unsafeUnwrap();
    expect(reloaded.flyerFullImageId).toBeNull();
  });

  it("returns not_found for a nonexistent event", async () => {
    const publisher = await makeUser("flyer-missing-publisher");
    const bytes = await makeJpeg(400, 400);

    const result = await imageService.replaceEventFlyer(
      actingAs(publisher),
      EventId.from_string(crypto.randomUUID())._unsafeUnwrap(),
      bytes,
    );

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });
});

describe("replaceOrganizationLogo", () => {
  it("an org_admin can upload a logo, producing two distinct variants of the shared thumbnail width", async () => {
    const admin = await makeUser("logo-admin");
    const orgId = await makeOrg("Logo Org", admin);
    const bytes = await makeJpeg(800, 800);

    const result = await imageService.replaceOrganizationLogo(
      actingAs(admin, false, { [orgId]: "org_admin" }),
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
      bytes,
    );

    const updated = result._unsafeUnwrap();
    expect(updated.logoFullImageId).not.toBeNull();
    expect(updated.logoThumbnailImageId).not.toBeNull();
    expect(updated.logoFullImageId).not.toBe(updated.logoThumbnailImageId);

    const thumbnail = (
      await sql`select width from images where sha256 = ${updated.logoThumbnailImageId}`
    )[0];
    expect(thumbnail.width).toBe(160);
  });

  it("an org_editor cannot upload a logo", async () => {
    const admin = await makeUser("logo-editor-admin");
    const editor = await makeUser("logo-editor-editor");
    const orgId = await makeOrg("Editor Logo Org", admin);
    await addOrgMember(orgId, editor, "org_editor");
    const bytes = await makeJpeg(400, 400);

    const result = await imageService.replaceOrganizationLogo(
      actingAs(editor, false, { [orgId]: "org_editor" }),
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
      bytes,
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("returns not_found when the org record is gone (requireOrgAdmin's DB existence check)", async () => {
    const admin = await makeUser("logo-deleted-org-admin");
    const orgId = await makeOrg("Deleted Logo Org", admin);
    await sql`delete from organization_memberships where org_id = ${orgId}`;
    await sql`delete from organizations where id = ${orgId}`;
    const bytes = await makeJpeg(400, 400);

    const result = await imageService.replaceOrganizationLogo(
      // Not site_admin - requireOrgAdmin only hits the DB existence check
      // (and thus can return not_found) for a non-site_admin caller; a
      // site_admin's org_admin-role check short-circuits before it.
      actingAs(admin, false, { [orgId]: "org_admin" }),
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
      bytes,
    );

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });
});
