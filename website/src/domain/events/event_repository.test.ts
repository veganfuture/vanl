import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "../auth/account_name";
import { AuthRepository } from "../auth/auth_repository";
import { SignalAci } from "../auth/signal_aci";
import type { UserId } from "../auth/user_id";
import { EventRepository, type NewEventInput } from "./event_repository";

const authRepository = new AuthRepository(sql);
const repository = new EventRepository(sql);

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

function baseEventInput(overrides: Partial<NewEventInput> = {}): NewEventInput {
  const now = new Date();
  return {
    slug: `test-event-${crypto.randomUUID()}`,
    title: "Test Event",
    description: "A test event",
    startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    endAt: null,
    locationKind: "meeting_point_city_only",
    placeId: testPlaceId,
    locationDescription: "Somewhere in town",
    locationStreet: null,
    locationHouseNumber: null,
    locationPostcode: null,
    locationLat: null,
    locationLng: null,
    locationPdokId: null,
    mapUrl: null,
    contactInfo: null,
    registrationInstructions: null,
    externalEventUrl: null,
    registrationUrl: null,
    publisherUserId: overrides.publisherUserId!,
    createdBy: overrides.createdBy ?? overrides.publisherUserId!,
    ...overrides,
  };
}

beforeAll(async () => {
  const rows = await sql`
    insert into places (name, municipality_name, province, source_id)
    values ('Test Fixture City', 'Test Fixture City', 'Utrecht', 'test-fixture-place')
    on conflict (source_id) do update set name = excluded.name
    returning id
  `;
  testPlaceId = rows[0].id as string;
});

beforeEach(async () => {
  await sql`truncate table events, signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("createEvent", () => {
  it("creates an event with a generated slug", async () => {
    const publisher = await makeUser("publisher-alice");

    const result = await repository.createEvent(
      baseEventInput({ publisherUserId: publisher, slug: "alice-event" }),
    );

    const event = result._unsafeUnwrap();
    expect(event.title).toBe("Test Event");
    expect(event.slug).toBe("alice-event");
    expect(event.publisherUserId.equals(publisher)).toBe(true);
    expect(event.status).toBe("visible");
    expect(event.placeId).toBe(testPlaceId);
  });

  it("stores precise_address PDOK fields when given", async () => {
    const publisher = await makeUser("publisher-bob");

    const result = await repository.createEvent(
      baseEventInput({
        publisherUserId: publisher,
        locationKind: "precise_address",
        locationStreet: "Europalaan",
        locationHouseNumber: "93",
        locationPostcode: "3526KP",
        locationLat: 52.06415055,
        locationLng: 5.10696041,
        locationPdokId: "adr-bf54db721969487ed33ba84d9973c702",
      }),
    );

    const event = result._unsafeUnwrap();
    expect(event.locationStreet).toBe("Europalaan");
    expect(event.locationLat).toBeCloseTo(52.06415055, 6);
  });
});

describe("lookups", () => {
  it("finds an event by slug and by id", async () => {
    const publisher = await makeUser("publisher-carol");
    const created = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "carol-event" }),
      )
    )._unsafeUnwrap();

    expect(
      (await repository.findEventBySlug("carol-event"))._unsafeUnwrap()?.id.equals(created.id),
    ).toBe(true);
    expect((await repository.findEventById(created.id))._unsafeUnwrap()?.slug).toBe("carol-event");
  });

  it("returns null for a slug that does not exist", async () => {
    expect((await repository.findEventBySlug("nonexistent"))._unsafeUnwrap()).toBeNull();
  });
});

describe("listVisibleEvents", () => {
  it("only returns visible events, soonest first", async () => {
    const publisher = await makeUser("publisher-dave");
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const later_ = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "later-event", startAt: later }),
      )
    )._unsafeUnwrap();
    const soon_ = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "soon-event", startAt: soon }),
      )
    )._unsafeUnwrap();
    const hidden = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "hidden-event" }),
      )
    )._unsafeUnwrap();
    await repository.setEventStatus(hidden.id, "hidden", null, publisher);

    const visible = (await repository.listVisibleEvents())._unsafeUnwrap();

    expect(visible.map((event) => event.slug)).toEqual(["soon-event", "later-event"]);
    void later_;
    void soon_;
  });
});

describe("updateEvent", () => {
  it("updates editable fields", async () => {
    const publisher = await makeUser("publisher-erin");
    const created = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "erin-event" }),
      )
    )._unsafeUnwrap();

    const updated = (
      await repository.updateEvent(
        created.id,
        { ...baseEventInput({ publisherUserId: publisher }), title: "Updated Title" },
        publisher,
      )
    )._unsafeUnwrap();

    expect(updated.title).toBe("Updated Title");
    expect(updated.updatedBy.equals(publisher)).toBe(true);
  });
});

describe("setEventStatus", () => {
  it("cancels an event with a reason", async () => {
    const publisher = await makeUser("publisher-frank");
    const created = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "frank-event" }),
      )
    )._unsafeUnwrap();

    const cancelled = (
      await repository.setEventStatus(created.id, "cancelled", "Venue fell through", publisher)
    )._unsafeUnwrap();

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("Venue fell through");
  });
});

describe("deleteEvent", () => {
  it("hard-deletes the event", async () => {
    const publisher = await makeUser("publisher-grace");
    const created = (
      await repository.createEvent(
        baseEventInput({ publisherUserId: publisher, slug: "grace-event" }),
      )
    )._unsafeUnwrap();

    (await repository.deleteEvent(created.id))._unsafeUnwrap();

    expect((await repository.findEventById(created.id))._unsafeUnwrap()).toBeNull();
  });
});
