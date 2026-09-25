import { createAsync, query } from "@solidjs/router";
import { apiFetch } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";

/**
 * Shared data-loading for the handful of endpoints many pages independently
 * ask for (`me`, the bare organizations list, ...). Wrapping each in
 * `query()` gives every caller one shared cache entry - so e.g. Navbar and
 * whatever page is rendered alongside it don't each fire their own request -
 * and reading it through `createAsync` (rather than plain `createResource`)
 * is what actually skips the fetch on the client during hydration: it's
 * `createAsync`'s hydration path, not resource serialization by itself,
 * that stops the browser from redoing a request whose data already arrived
 * in the SSR'd HTML.
 */

const getMe = query(async () => {
  const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
  return result.match(
    (data) => data.user,
    () => null,
  );
}, "me");

/** Loading is `me() === undefined` - `null` is a resolved "not logged in". */
export function useMe() {
  return createAsync(() => getMe());
}

const getOrganizations = query(async () => {
  const result = await apiFetch("/api/organizations", {
    response: ListOrganizationsResponseSchema,
  });
  return result.match(
    (data) => data.organizations,
    () => [],
  );
}, "organizations");

export function useOrganizations() {
  return createAsync(() => getOrganizations());
}

const getEvents = query(async (provinces: string[], orgIds: string[]) => {
  const qs = new URLSearchParams();
  if (provinces.length > 0) qs.set("province", provinces.join(","));
  if (orgIds.length > 0) qs.set("org", orgIds.join(","));
  const suffix = qs.toString();
  const result = await apiFetch(`/api/events${suffix ? `?${suffix}` : ""}`, {
    response: ListEventsResponseSchema,
  });
  return result.match(
    (data) => data.events,
    () => [],
  );
}, "events");

/** `provinces`/`orgIds` are read reactively - pass the signal accessors, not their values. */
export function useEvents(provinces: () => string[], orgIds: () => string[]) {
  return createAsync(() => getEvents(provinces(), orgIds()));
}

const getNextEventsPerOrg = query(async () => {
  const result = await apiFetch("/api/events?nextPerOrg=true", {
    response: ListEventsResponseSchema,
  });
  return result.match(
    (data) => data.events,
    () => [],
  );
}, "events-next-per-org");

export function useNextEventsPerOrg() {
  return createAsync(() => getNextEventsPerOrg());
}
