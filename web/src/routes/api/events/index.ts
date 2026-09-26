import type { APIEvent } from "@solidjs/start/server";
import { canLinkEventOrg, canModifyEvent, eventService } from "~/domain/events/event_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { parseJsonBody } from "~/lib/http";
import { PROVINCES } from "~/lib/provinces";
import type { Uuid } from "~/lib/uuid";
import { EventRequestSchema, toEventJson } from "./event.schema";
import type { CreateEventResponse, ListEventsResponse } from "./index.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  validation: 400,
  location_unresolved: 400,
  internal_error: 500,
};

const VALID_PROVINCES = new Set<string>(PROVINCES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Comma-separated query param -> deduped list, silently dropping anything
 * that can't possibly match (garbage from a hand-edited URL) rather than
 * letting it reach the DB - an unrecognized `province` value would otherwise
 * fail the query outright (invalid input for the Postgres enum), and a
 * malformed `org` id would fail the uuid comparison the same way.
 */
function parseFilterParam(raw: string | null, isValid: (value: string) => boolean): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter(isValid),
    ),
  ];
}

/**
 * Public listing - not gated on login, but resolves the (possibly
 * anonymous) acting user so site admins see every status (hidden/cancelled
 * included, not just visible) and so canEdit reflects reality instead of
 * always being false.
 *
 * Three optional query params select an alternate listing instead of the
 * default "everything the viewer may see": `nextPerOrg=true` returns just
 * the soonest upcoming event per org (organizations list page's preview);
 * `orgId=<uuid>` returns every upcoming event for one org (organization
 * detail page); `limit=<n>` returns the soonest `n` upcoming events
 * site-wide (homepage teaser), applied as a SQL `LIMIT`. All three are
 * public, visible-only listings regardless of who's asking - unlike the
 * unfiltered default, they don't expose draft/hidden/cancelled events to
 * site admins. Otherwise, the default listing may be narrowed via
 * `?province=` and/or `?org=`, each a comma-separated list (multi-select
 * filters on the events page).
 */
export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  const searchParams = new URL(event.request.url).searchParams;
  const nextPerOrg = searchParams.get("nextPerOrg") === "true";
  const orgId = searchParams.get("orgId");
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const events = nextPerOrg
    ? await eventService.listNextUpcomingEventsByOrg()
    : orgId
      ? await eventService.listUpcomingVisibleEventsByOrg(orgId)
      : limit !== undefined
        ? await eventService.listUpcomingVisibleEvents(null, limit)
        : await eventService.listEventsForViewer(actingUser, {
            provinces: parseFilterParam(
              searchParams.get("province"),
              (v) => VALID_PROVINCES.has(v),
            ),
            orgIds: parseFilterParam(searchParams.get("org"), (v) => UUID_RE.test(v)),
          });

  if (events.isErr()) {
    return Response.json({ events: [] } satisfies ListEventsResponse);
  }
  const list = events.value;
  const municipalityByPlaceId = (await eventService.resolveMunicipalityNames(list)).unwrapOr(
    new Map<string, string>(),
  );

  return Response.json({
    events: list.map((e) =>
      toEventJson(
        e,
        canModifyEvent(e, actingUser),
        canLinkEventOrg(e, actingUser),
        municipalityByPlaceId.get(e.placeId) ?? null,
      ),
    ),
  } satisfies ListEventsResponse);
}

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies CreateEventResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const parsed = EventRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies CreateEventResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await eventService.createEvent(actingUser, {
    ...parsed.data,
    // EventRequestSchema's placeId is z.string().uuid() - already format-validated, trusted here.
    placeId: parsed.data.placeId as Uuid | null,
    startAt: new Date(parsed.data.startAt),
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
  });

  return result.match(
    (created) =>
      Response.json(
        toEventJson(
          created,
          canModifyEvent(created, actingUser),
          canLinkEventOrg(created, actingUser),
        ) satisfies CreateEventResponse,
        {
          status: 201,
        },
      ),
    (error) =>
      Response.json({ error } satisfies CreateEventResponse, { status: ERROR_STATUS[error] }),
  );
}
