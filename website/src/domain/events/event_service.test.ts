import { errAsync, okAsync } from "neverthrow";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
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

function actingAs(userId: UserId, isSiteAdmin = false): ActingUser {
  return { id: userId, isSiteAdmin };
}

function baseInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    title: "Test Event",
    description: "A test event",
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endAt: null,
    locationKind: "meeting_point_city_only",
    placeId: testPlaceId,
    locationDescription: "Somewhere in town",
    pdokAddressId: null,
    mapUrl: null,
    contactInfo: null,
    registrationInstructions: null,
    externalEventUrl: null,
    registrationUrl: null,
    ...overrides,
  };
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
  await sql`truncate table events, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
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

    const result = await service.createEvent(publisher, baseInput());

    const event = result._unsafeUnwrap();
    expect(event.publisherUserId.equals(publisher)).toBe(true);
    expect(event.slug).toMatch(/^test-event-[0-9a-f]{8}$/);
  });

  it("rejects an empty title", async () => {
    const publisher = await makeUser("publisher-with-bad-title");
    const result = await service.createEvent(publisher, baseInput({ title: "   " }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects endAt before startAt", async () => {
    const publisher = await makeUser("publisher-with-bad-dates");
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await service.createEvent(publisher, baseInput({ startAt, endAt }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects a malformed URL field", async () => {
    const publisher = await makeUser("publisher-with-bad-url");
    const result = await service.createEvent(publisher, baseInput({ mapUrl: "not-a-url" }));
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
      }),
    );

    const result = await service.createEvent(
      publisher,
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
      publisher,
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
      }),
    );

    const result = await service.createEvent(
      publisher,
      baseInput({ locationKind: "precise_address", placeId: null, pdokAddressId: "adr-789" }),
    );

    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects precise_address without a pdokAddressId", async () => {
    const publisher = await makeUser("publisher-with-missing-pdok-id");
    const result = await service.createEvent(
      publisher,
      baseInput({ locationKind: "precise_address", placeId: null, pdokAddressId: null }),
    );
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });

  it("rejects meeting_point_city_only without a placeId", async () => {
    const publisher = await makeUser("publisher-with-missing-place");
    const result = await service.createEvent(publisher, baseInput({ placeId: null }));
    expect(result._unsafeUnwrapErr()).toBe("validation");
  });
});

describe("public read access (Visitor row of the permission matrix)", () => {
  it("getEventBySlug and listVisibleEvents work without any acting user", async () => {
    const publisher = await makeUser("publisher-for-reads");
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

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
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

    const result = await service.updateEvent(
      actingAs(publisher),
      created.id,
      baseInput({ title: "Updated by owner" }),
    );

    expect(result._unsafeUnwrap().title).toBe("Updated by owner");
  });

  it("a different, non-admin user cannot update someone else's event", async () => {
    const publisher = await makeUser("owner-for-forbidden-update");
    const stranger = await makeUser("stranger-tries-update");
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

    const result = await service.updateEvent(actingAs(stranger), created.id, baseInput());

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("the publisher can cancel their own event with a reason", async () => {
    const publisher = await makeUser("owner-cancels-own");
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

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
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

    const result = await service.setEventStatus(actingAs(stranger), created.id, "cancelled", null);

    expect(result._unsafeUnwrapErr()).toBe("forbidden");
  });

  it("the publisher can delete their own event", async () => {
    const publisher = await makeUser("owner-deletes-own");
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

    (await service.deleteEvent(actingAs(publisher), created.id))._unsafeUnwrap();

    expect((await service.getEventBySlug(created.slug))._unsafeUnwrap()).toBeNull();
  });

  it("a different, non-admin user cannot delete someone else's event", async () => {
    const publisher = await makeUser("owner-for-forbidden-delete");
    const stranger = await makeUser("stranger-tries-delete");
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

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
    const created = (await service.createEvent(publisher, baseInput()))._unsafeUnwrap();

    const hidden = (
      await service.setEventStatus(actingAs(admin, true), created.id, "hidden", null)
    )._unsafeUnwrap();
    expect(hidden.status).toBe("hidden");

    (await service.deleteEvent(actingAs(admin, true), created.id))._unsafeUnwrap();
    expect((await service.getEventBySlug(created.slug))._unsafeUnwrap()).toBeNull();
  });
});
