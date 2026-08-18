import { errAsync, okAsync } from "neverthrow";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import { OrganizationId } from "../organizations/organization_id";
import { OrganizationRepository } from "../organizations/organization_repository";
import type { OrgRole } from "../organizations/organization";
import { EventId } from "./event_id";
import type { ActingUser, EventInput } from "./event_service";

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
const service = new EventService(repository, placeRepository);

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
    ...overrides,
  };
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

beforeAll(async () => {
  const rows = await sql`
    insert into places (name, municipality_name, province, source_id)
    values ('Test Fixture City', 'Test Fixture City', 'Utrecht', 'test-fixture-place-service')
    on conflict (source_id) do update set name = excluded.name
    returning id
  `;
  testPlaceId = rows[0].id as string;
});

beforeEach(async () => {
  await sql`truncate table events, organizations, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
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
    expect(event.cancelReason).toBe("Rescheduling");
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
