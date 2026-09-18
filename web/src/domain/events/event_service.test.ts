import { errAsync, okAsync } from "neverthrow";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { sql } from "~/lib/db";
import type { Uuid } from "~/lib/uuid";
import { ImageRepository } from "~/domain/images/image_repository";
import { AccountName } from "../auth/account_name";
import { actingAs } from "../auth/acting_user.test-helpers";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import { OrganizationId } from "../organizations/organization_id";
import { OrganizationRepository } from "../organizations/organization_repository";
import type { OrgRole } from "../organizations/organization";
import { EventId } from "./event_id";
import type { EventInput } from "./event_service";

vi.mock("./pdok-client", () => ({
  lookupAddress: vi.fn(),
}));

const { lookupAddress } = await import("./pdok-client");
const { EventRepository } = await import("./event_repository");
const { EventService } = await import("./event_service");
const { PlaceRepository } = await import("../places/place_repository");

const authRepository = new AuthRepository(sql);
const organizationRepository = new OrganizationRepository(sql);
const repository = new EventRepository(sql);
const placeRepository = new PlaceRepository(sql);
const imageRepository = new ImageRepository(sql);
const service = new EventService(
  repository,
  placeRepository,
  imageRepository,
  organizationRepository,
);

let testPlaceId: Uuid;

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

function baseInput(overrides: Partial<EventInput> = {}): EventInput {
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
    status: "visible",
    ...overrides,
  };
}

/** Creates an org with `adminUserId` as its sole org_admin, returning its id as a plain string (matches ActingUser.orgRoles' key type). */
async function makeOrg(name: string, adminUserId: UserId): Promise<string> {
  const org = (
    await organizationRepository.createOrganizationWithAdmin(
      {
        name,
        slug: `${name}-${crypto.randomUUID()}`,
        descriptionNl: null,
        descriptionEn: null,
        websiteUrl: null,
      },
      adminUserId,
    )
  )._unsafeUnwrap();
  return org.id.value;
}

async function addOrgMember(orgId: string, userId: UserId, role: OrgRole): Promise<void> {
  const orgIdValue = OrganizationId.from_string(orgId)._unsafeUnwrap();
  (await organizationRepository.addMembership(orgIdValue, userId, role))._unsafeUnwrap();
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 150, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  const rows = await sql`
    insert into places (name, municipality_name, province, source_id)
    values ('Test Fixture City', 'Test Fixture City', 'Utrecht', 'test-fixture-place-service')
    on conflict (source_id) do update set name = excluded.name
    returning id
  `;
  testPlaceId = rows[0].id as Uuid;
});

beforeEach(async () => {
  await sql`truncate table images, events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
  vi.mocked(lookupAddress).mockClear();
});

afterAll(async () => {
  await sql.end();
});

describe("createEvent", () => {
  it("any authenticated user can create an event published as themselves", async () => {
    // "first user created is site_admin" would make this user an admin too -
    // create a throwaway user first so this one is a plain, non-admin user.
    await makeUser("bootstrap-admin");
    const publisher = await makeUser("regular-publisher");

    const result = await service.createEvent(actingAs(publisher), baseInput());

    const event = result._unsafeUnwrap();
    expect(event.publisherUserId?.equals(publisher)).toBe(true);
    expect(event.slug).toMatch(/^test-event-[0-9a-f]{8}$/);
  });

  it("rejects when neither titleNl nor titleEn is given", async () => {
    const publisher = await makeUser("publisher-with-bad-title");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ titleNl: "   ", titleEn: null }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects when neither descriptionNl nor descriptionEn is given", async () => {
    const publisher = await makeUser("publisher-with-bad-description");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ descriptionNl: null, descriptionEn: "   " }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("accepts a title/description given in only one language", async () => {
    const publisher = await makeUser("publisher-with-nl-only");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({
        titleNl: "Alleen Nederlands",
        titleEn: null,
        descriptionNl: "Een Nederlandse beschrijving",
        descriptionEn: null,
      }),
    );

    const event = result._unsafeUnwrap();
    expect(event.titleNl).toBe("Alleen Nederlands");
    expect(event.titleEn).toBeNull();
  });

  it("rejects a title given without a matching-language description", async () => {
    const publisher = await makeUser("publisher-with-mismatched-nl");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ titleNl: "Titel zonder beschrijving", descriptionNl: null }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects creating an event with a startAt in the past", async () => {
    const publisher = await makeUser("publisher-with-past-start");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ startAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects endAt before startAt", async () => {
    const publisher = await makeUser("publisher-with-bad-dates");
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await service.createEvent(actingAs(publisher), baseInput({ startAt, endAt }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a malformed URL field", async () => {
    const publisher = await makeUser("publisher-with-bad-url");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ mapUrl: "not-a-url" }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a title over 200 characters", async () => {
    const publisher = await makeUser("publisher-with-long-title");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ titleEn: "a".repeat(201) }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a description over 10000 characters", async () => {
    const publisher = await makeUser("publisher-with-long-description");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ descriptionEn: "a".repeat(10001) }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a location description over 500 characters", async () => {
    const publisher = await makeUser("publisher-with-long-location");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ locationDescription: "a".repeat(501) }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a URL field over 2000 characters", async () => {
    const publisher = await makeUser("publisher-with-long-url");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ mapUrl: `https://example.com/${"a".repeat(2000)}` }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("resolves PDOK fields and placeId for precise_address when the lookup succeeds", async () => {
    const publisher = await makeUser("publisher-with-good-pdok");
    vi.mocked(lookupAddress).mockReturnValue(
      okAsync({
        pdokId: "adr-123",
        street: "Europalaan",
        houseNumber: "93",
        postcode: "3526KP",
        woonplaatsNaam: "Test Fixture City",
        lat: 52.06,
        lng: 5.1,
        label: "Europalaan 93, 3526KP Test Fixture City",
      }),
    );

    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({
        locationKind: "precise_address",
        placeId: null,
        pdokAddressId: "adr-123",
      }),
    );

    const event = result._unsafeUnwrap();
    expect(event.locationStreet).toBe("Europalaan");
    expect(event.locationPdokId).toBe("adr-123");
    expect(event.placeId).toBe(testPlaceId);
  });

  it("fails instead of saving a precise_address event when PDOK is unreachable", async () => {
    const publisher = await makeUser("publisher-with-down-pdok");
    vi.mocked(lookupAddress).mockReturnValue(errAsync({ message: "network error" }));

    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ locationKind: "precise_address", placeId: null, pdokAddressId: "adr-456" }),
    );

    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("fails when the PDOK-resolved city has no matching place row", async () => {
    const publisher = await makeUser("publisher-with-unknown-city");
    vi.mocked(lookupAddress).mockReturnValue(
      okAsync({
        pdokId: "adr-789",
        street: "Nergensweg",
        houseNumber: "1",
        postcode: "0000AA",
        woonplaatsNaam: "Nonexistent Place That Was Never Seeded",
        lat: 0,
        lng: 0,
        label: "Nergensweg 1, 0000AA Nonexistent Place That Was Never Seeded",
      }),
    );

    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ locationKind: "precise_address", placeId: null, pdokAddressId: "adr-789" }),
    );

    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects precise_address without a pdokAddressId", async () => {
    const publisher = await makeUser("publisher-with-missing-pdok-id");
    const result = await service.createEvent(
      actingAs(publisher),
      baseInput({ locationKind: "precise_address", placeId: null, pdokAddressId: null }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects meeting_point_city_only without a placeId", async () => {
    const publisher = await makeUser("publisher-with-missing-place");
    const result = await service.createEvent(actingAs(publisher), baseInput({ placeId: null }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });
});

describe("public read access (Visitor row of the permission matrix)", () => {
  it("getEventBySlug and listVisibleEvents work without any acting user", async () => {
    const publisher = await makeUser("publisher-for-reads");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    expect(
      (await service.getEventBySlug(created.slug))._unsafeUnwrap()?.id.equals(created.id),
    ).toBe(true);
    expect((await service.listVisibleEvents())._unsafeUnwrap().map((e) => e.id.value)).toContain(
      created.id.value,
    );
  });
});

describe("edit/delete/cancel own event (Editor row of the permission matrix)", () => {
  it("the publisher can update their own event", async () => {
    const publisher = await makeUser("owner-updates-own");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.updateEvent(
      actingAs(publisher),
      created.id,
      baseInput({ titleEn: "Updated by owner" }),
    );

    expect(result._unsafeUnwrap().titleEn).toBe("Updated by owner");
  });

  it("a different, non-admin user cannot update someone else's event", async () => {
    const publisher = await makeUser("owner-for-forbidden-update");
    const stranger = await makeUser("stranger-tries-update");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.updateEvent(actingAs(stranger), created.id, baseInput());

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("the publisher can cancel their own event with a reason", async () => {
    const publisher = await makeUser("owner-cancels-own");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.setEventStatus(
      actingAs(publisher),
      created.id,
      "cancelled",
      "Rescheduling",
    );

    const event = result._unsafeUnwrap();
    expect(event.status).toBe("cancelled");
    expect(event.statusReason).toBe("Rescheduling");
  });

  it("a different, non-admin user cannot cancel someone else's event", async () => {
    const publisher = await makeUser("owner-for-forbidden-cancel");
    const stranger = await makeUser("stranger-tries-cancel");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.setEventStatus(actingAs(stranger), created.id, "cancelled", null);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("the publisher can delete their own event", async () => {
    const publisher = await makeUser("owner-deletes-own");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    (await service.deleteEvent(actingAs(publisher), created.id))._unsafeUnwrap();

    expect((await service.getEventBySlug(created.slug))._unsafeUnwrap()).toBeNull();
  });

  it("a different, non-admin user cannot delete someone else's event", async () => {
    const publisher = await makeUser("owner-for-forbidden-delete");
    const stranger = await makeUser("stranger-tries-delete");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.deleteEvent(actingAs(stranger), created.id);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
    expect((await service.getEventBySlug(created.slug))._unsafeUnwrap()).not.toBeNull();
  });

  it("returns not_found for an event id that does not exist", async () => {
    const someone = await makeUser("someone-checks-missing-event");
    const missingId = EventId.from_string(crypto.randomUUID())._unsafeUnwrap();

    const result = await service.updateEvent(actingAs(someone), missingId, baseInput());

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });
});

describe("draft status", () => {
  it("creates an event as a draft when requested", async () => {
    const publisher = await makeUser("owner-creates-draft");
    const created = (
      await service.createEvent(actingAs(publisher), baseInput({ status: "draft" }))
    )._unsafeUnwrap();

    expect(created.status).toBe("draft");
  });

  it("publishes a draft via update when the publisher requests it", async () => {
    const publisher = await makeUser("owner-publishes-draft");
    const created = (
      await service.createEvent(actingAs(publisher), baseInput({ status: "draft" }))
    )._unsafeUnwrap();

    const updated = (
      await service.updateEvent(actingAs(publisher), created.id, baseInput({ status: "visible" }))
    )._unsafeUnwrap();

    expect(updated.status).toBe("visible");
  });

  it("a published event can never go back to draft via update", async () => {
    const publisher = await makeUser("owner-cannot-redraft");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();
    expect(created.status).toBe("visible");

    const updated = (
      await service.updateEvent(actingAs(publisher), created.id, baseInput({ status: "draft" }))
    )._unsafeUnwrap();

    expect(updated.status).toBe("visible");
  });
});

describe("site_admin moderation override", () => {
  it("a site_admin can hide/delete another user's event (manual moderation, docs/milestones.md)", async () => {
    const publisher = await makeUser("owner-moderated-by-admin");
    const admin = await makeUser("acting-site-admin");
    const created = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const hidden = (
      await service.setEventStatus(actingAs(admin, true), created.id, "hidden", null)
    )._unsafeUnwrap();
    expect(hidden.status).toBe("hidden");

    (await service.deleteEvent(actingAs(admin, true), created.id))._unsafeUnwrap();
    expect((await service.getEventBySlug(created.slug))._unsafeUnwrap()).toBeNull();
  });
});

describe("organization-authored events (org rows of the permission matrix)", () => {
  it("an org_editor can create an event on behalf of their org", async () => {
    const admin = await makeUser("org-admin-for-editor-create");
    const editor = await makeUser("org-editor-who-creates");
    const orgId = await makeOrg("Editor Create Org", admin);
    await addOrgMember(orgId, editor, "org_editor");

    const result = await service.createEvent(
      actingAs(editor, false, { [orgId]: "org_editor" }),
      baseInput({ orgId }),
    );

    const event = result._unsafeUnwrap();
    expect(event.publisherUserId).toBeNull();
    expect(event.publisherOrgId?.value).toBe(orgId);
    expect(event.createdBy.equals(editor)).toBe(true);
  });

  it("a non-member cannot create an event on behalf of an org they don't belong to", async () => {
    const admin = await makeUser("org-admin-for-non-member-create");
    const stranger = await makeUser("stranger-tries-org-create");
    const orgId = await makeOrg("Non-Member Create Org", admin);

    const result = await service.createEvent(actingAs(stranger), baseInput({ orgId }));

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("an org_admin can edit any event of their org, regardless of who created it", async () => {
    const admin = await makeUser("org-admin-edits-any");
    const editor = await makeUser("org-editor-created-it");
    const orgId = await makeOrg("Admin Edits Any Org", admin);
    await addOrgMember(orgId, editor, "org_editor");
    const created = (
      await service.createEvent(
        actingAs(editor, false, { [orgId]: "org_editor" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.updateEvent(
      actingAs(admin, false, { [orgId]: "org_admin" }),
      created.id,
      baseInput({ orgId, titleEn: "Updated by org_admin" }),
    );

    expect(result._unsafeUnwrap().titleEn).toBe("Updated by org_admin");
  });

  it("an org_editor can edit an org event they personally created", async () => {
    const admin = await makeUser("org-admin-for-editor-own-edit");
    const editor = await makeUser("org-editor-edits-own");
    const orgId = await makeOrg("Editor Own Edit Org", admin);
    await addOrgMember(orgId, editor, "org_editor");
    const editorActing = actingAs(editor, false, { [orgId]: "org_editor" });
    const created = (await service.createEvent(editorActing, baseInput({ orgId })))._unsafeUnwrap();

    const result = await service.updateEvent(
      editorActing,
      created.id,
      baseInput({ orgId, titleEn: "Updated by its own creator" }),
    );

    expect(result._unsafeUnwrap().titleEn).toBe("Updated by its own creator");
  });

  it("an org_editor cannot edit another editor's org event", async () => {
    const admin = await makeUser("org-admin-for-editor-vs-editor");
    const editorA = await makeUser("org-editor-a");
    const editorB = await makeUser("org-editor-b");
    const orgId = await makeOrg("Editor Vs Editor Org", admin);
    await addOrgMember(orgId, editorA, "org_editor");
    await addOrgMember(orgId, editorB, "org_editor");
    const created = (
      await service.createEvent(
        actingAs(editorA, false, { [orgId]: "org_editor" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.updateEvent(
      actingAs(editorB, false, { [orgId]: "org_editor" }),
      created.id,
      baseInput({ orgId }),
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("listMyEvents returns both individually-published events and events published by any org the caller belongs to", async () => {
    const user = await makeUser("mixed-events-user");
    const orgId = await makeOrg("Mixed Events Org", user);
    const ownEvent = (
      await service.createEvent(actingAs(user), baseInput({ titleEn: "My own event" }))
    )._unsafeUnwrap();
    const orgEvent = (
      await service.createEvent(
        actingAs(user, false, { [orgId]: "org_admin" }),
        baseInput({ orgId, titleEn: "My org's event" }),
      )
    )._unsafeUnwrap();

    const result = await service.listMyEvents(actingAs(user, false, { [orgId]: "org_admin" }));
    const ids = result._unsafeUnwrap().map((e) => e.id.value);

    expect(ids).toContain(ownEvent.id.value);
    expect(ids).toContain(orgEvent.id.value);
  });
});

describe("replaceFlyer", () => {
  it("the event's publisher can upload a flyer, producing three distinct variants", async () => {
    const publisher = await makeUser("flyer-publisher");
    const event = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();
    const bytes = await makeJpeg(2000, 1200);

    const result = await service.replaceFlyer(actingAs(publisher), event.id, bytes);

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
    const event = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();
    const bytes = await makeJpeg(400, 400);

    const result = await service.replaceFlyer(actingAs(stranger), event.id, bytes);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("rejects a non-image upload without touching the event", async () => {
    const publisher = await makeUser("flyer-garbage-publisher");
    const event = (await service.createEvent(actingAs(publisher), baseInput()))._unsafeUnwrap();

    const result = await service.replaceFlyer(
      actingAs(publisher),
      event.id,
      Buffer.from("not an image"),
    );

    expect(result._unsafeUnwrapErr()).toBe("validation");
    const reloaded = (
      await service.loadForModification(actingAs(publisher), event.id)
    )._unsafeUnwrap();
    expect(reloaded.flyerFullImageId).toBeNull();
  });

  it("returns not_found for a nonexistent event", async () => {
    const publisher = await makeUser("flyer-missing-publisher");
    const bytes = await makeJpeg(400, 400);

    const result = await service.replaceFlyer(
      actingAs(publisher),
      EventId.from_string(crypto.randomUUID())._unsafeUnwrap(),
      bytes,
    );

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });
});

describe("addEventToOrganization / removeEventFromOrganization", () => {
  it("the event's own creator can attach it to an org they're an org_editor of", async () => {
    const author = await makeUser("org-link-author-editor");
    const admin = await makeUser("org-link-admin-for-editor");
    const orgId = await makeOrg("Org Link Editor Org", admin);
    await addOrgMember(orgId, author, "org_editor");
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(author, false, { [orgId]: "org_editor" }),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    const updated = result._unsafeUnwrap();
    expect(updated.publisherOrgId?.value).toBe(orgId);
    expect(updated.publisherUserId).toBeNull();
  });

  it("the event's own creator can attach it to an org they're an org_admin of", async () => {
    const author = await makeUser("org-link-author-admin");
    const orgId = await makeOrg("Org Link Admin Org", author);
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(author, false, { [orgId]: "org_admin" }),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrap().publisherOrgId?.value).toBe(orgId);
  });

  it("a non-creator cannot attach someone else's event to an org, even one they belong to", async () => {
    const author = await makeUser("org-link-author-for-stranger");
    const stranger = await makeUser("org-link-stranger");
    const orgId = await makeOrg("Org Link Stranger Org", stranger);
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(stranger, false, { [orgId]: "org_admin" }),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("the creator cannot attach their own event to an org they don't belong to", async () => {
    const author = await makeUser("org-link-author-not-member");
    const otherAdmin = await makeUser("org-link-other-admin");
    const orgId = await makeOrg("Org Link Not Member Org", otherAdmin);
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(author),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("a site_admin can attach any event to any org, regardless of membership", async () => {
    const author = await makeUser("org-link-author-for-site-admin");
    const orgOwner = await makeUser("org-link-owner-for-site-admin");
    const admin = await makeUser("org-link-site-admin");
    const orgId = await makeOrg("Org Link Site Admin Org", orgOwner);
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(admin, true),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrap().publisherOrgId?.value).toBe(orgId);
  });

  it("returns already_in_org when the event is already attached to that org", async () => {
    const author = await makeUser("org-link-already-author");
    const orgId = await makeOrg("Org Link Already Org", author);
    const event = (
      await service.createEvent(
        actingAs(author, false, { [orgId]: "org_admin" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(author, false, { [orgId]: "org_admin" }),
      event.id,
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("already_in_org");
  });

  it("returns org_not_found for a well-formed but nonexistent org id", async () => {
    const author = await makeUser("org-link-missing-org-author");
    const event = (await service.createEvent(actingAs(author, true), baseInput()))._unsafeUnwrap();

    const result = await service.addEventToOrganization(
      actingAs(author, true),
      event.id,
      OrganizationId.from_string(crypto.randomUUID())._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("org_not_found");
  });

  it("returns not_found for a nonexistent event", async () => {
    const admin = await makeUser("org-link-missing-event-admin");
    const orgId = await makeOrg("Org Link Missing Event Org", admin);

    const result = await service.addEventToOrganization(
      actingAs(admin, true),
      EventId.from_string(crypto.randomUUID())._unsafeUnwrap(),
      OrganizationId.from_string(orgId)._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });

  it("the creator can detach their own event from its org, reverting it to self-published", async () => {
    const author = await makeUser("org-unlink-author");
    const orgId = await makeOrg("Org Unlink Author Org", author);
    const event = (
      await service.createEvent(
        actingAs(author, false, { [orgId]: "org_admin" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.removeEventFromOrganization(
      actingAs(author, false, { [orgId]: "org_admin" }),
      event.id,
    );

    const updated = result._unsafeUnwrap();
    expect(updated.publisherOrgId).toBeNull();
    expect(updated.publisherUserId?.equals(author)).toBe(true);
  });

  it("a site_admin can detach any event from its org", async () => {
    const author = await makeUser("org-unlink-author-for-admin");
    const admin = await makeUser("org-unlink-site-admin");
    const orgId = await makeOrg("Org Unlink Site Admin Org", author);
    const event = (
      await service.createEvent(
        actingAs(author, false, { [orgId]: "org_admin" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.removeEventFromOrganization(actingAs(admin, true), event.id);

    expect(result._unsafeUnwrap().publisherOrgId).toBeNull();
  });

  it("a non-creator org_admin cannot detach an event they didn't create", async () => {
    const author = await makeUser("org-unlink-author-vs-admin");
    const otherAdmin = await makeUser("org-unlink-other-admin");
    const orgId = await makeOrg("Org Unlink Other Admin Org", author);
    await addOrgMember(orgId, otherAdmin, "org_admin");
    const event = (
      await service.createEvent(
        actingAs(author, false, { [orgId]: "org_admin" }),
        baseInput({ orgId }),
      )
    )._unsafeUnwrap();

    const result = await service.removeEventFromOrganization(
      actingAs(otherAdmin, false, { [orgId]: "org_admin" }),
      event.id,
    );

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("returns not_in_org when the event has no org to detach from", async () => {
    const author = await makeUser("org-unlink-no-org-author");
    const event = (await service.createEvent(actingAs(author), baseInput()))._unsafeUnwrap();

    const result = await service.removeEventFromOrganization(actingAs(author), event.id);

    expect(result._unsafeUnwrapErr()).toBe("not_in_org");
  });

  it("returns not_found for a nonexistent event", async () => {
    const admin = await makeUser("org-unlink-missing-event-admin");

    const result = await service.removeEventFromOrganization(
      actingAs(admin, true),
      EventId.from_string(crypto.randomUUID())._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrapErr()).toBe("not_found");
  });
});
