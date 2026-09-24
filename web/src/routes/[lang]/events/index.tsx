import { useSearchParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { EventCard } from "~/components/EventCard";
import { ChevronDownIcon, FilterIcon } from "~/components/icons";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { MultiSelectAutocomplete } from "~/components/MultiSelectAutocomplete";
import { apiFetch } from "~/lib/api-fetch";
import { GROUPS } from "~/lib/groups";
import { useLang } from "~/lib/i18n";
import { PROVINCES } from "~/lib/provinces";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import type { EventJson } from "~/routes/api/events/event.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";

/** A search-param value can arrive as a single string or (in principle) an array - always take the first. */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Monday-first, matching the "This week"/"This weekend" bucketing in eventGroups below. */
const WEEKDAYS = [
  { value: "mon", labelNl: "ma", labelEn: "Mon" },
  { value: "tue", labelNl: "di", labelEn: "Tue" },
  { value: "wed", labelNl: "wo", labelEn: "Wed" },
  { value: "thu", labelNl: "do", labelEn: "Thu" },
  { value: "fri", labelNl: "vr", labelEn: "Fri" },
  { value: "sat", labelNl: "za", labelEn: "Sat" },
  { value: "sun", labelNl: "zo", labelEn: "Sun" },
] as const;

/** Date#getDay() (0 = Sunday) -> this page's weekday filter code. */
const WEEKDAY_CODE_BY_JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** A single group of events in display order, headed by either a "This week"/"This weekend" or a month divider - see eventGroups below. */
type EventGroup = {
  key: string;
  label: string;
  items: EventJson[];
};

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

/** Not every event organizers run makes it into this calendar - many are only ever posted in this Signal group. */
const eventsSignalGroup = GROUPS.find((g) => g.id === "events");

export default function EventsListPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  // Only shown for site admins - listVisibleEvents-only for everyone else,
  // so a real visitor never sees a status other than "visible" here anyway.
  const statusLabels: Record<string, string> = {
    draft: t("Concept", "Draft"),
    hidden: t("Verborgen", "Hidden"),
    cancelled: t("Geannuleerd", "Cancelled"),
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProvinces = () => parseCommaList(firstParam(searchParams.province));
  const selectedOrgIds = () => parseCommaList(firstParam(searchParams.org));
  const selectedWeekdays = () => parseCommaList(firstParam(searchParams.weekday));

  function setProvinceFilter(values: string[]) {
    setSearchParams({ province: values.length > 0 ? values.join(",") : undefined });
  }
  function setOrgFilter(values: string[]) {
    setSearchParams({ org: values.length > 0 ? values.join(",") : undefined });
  }
  function setWeekdayFilter(values: string[]) {
    setSearchParams({ weekday: values.length > 0 ? values.join(",") : undefined });
  }
  function removeProvince(value: string) {
    setProvinceFilter(selectedProvinces().filter((v) => v !== value));
  }
  function removeOrg(value: string) {
    setOrgFilter(selectedOrgIds().filter((v) => v !== value));
  }
  function toggleWeekday(value: string) {
    const current = selectedWeekdays();
    setWeekdayFilter(
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }
  function clearAllFilters() {
    setProvinceFilter([]);
    setOrgFilter([]);
    setWeekdayFilter([]);
  }

  // Collapsed by default to keep the page uncluttered when no filter is
  // active - but starts open if the page was loaded with filters already in
  // the URL (e.g. a shared link), so the user immediately sees what's applied.
  const [filtersOpen, setFiltersOpen] = createSignal(
    selectedProvinces().length > 0 || selectedOrgIds().length > 0 || selectedWeekdays().length > 0,
  );

  // On mobile the filter bar is sticky (see the JSX below) and tracks the
  // navbar down the page. "docked" is true once it has actually reached the
  // navbar's bottom edge (not just "the user scrolled some amount") - at
  // that exact point it switches to a flush, full-bleed, no-radius style so
  // it reads as one continuous bar with the navbar above it, and any open
  // filter form auto-collapses so it doesn't eat scroll space while stuck.
  // 41 = Navbar's own shrunk-on-scroll height (40px, see Navbar.tsx - tuned
  // to match this bar's own collapsed height) plus a touch of buffer - the
  // navbar has always already shrunk by the time this bar (further down the
  // page) gets anywhere near the top, since Navbar shrinks at the very
  // first pixel of scroll.
  let filterBarRef: HTMLDivElement | undefined;
  const [docked, setDocked] = createSignal(false);

  onMount(() => {
    const onScroll = () => {
      setDocked((filterBarRef?.getBoundingClientRect().top ?? Infinity) <= 41);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  createEffect(() => {
    if (docked()) setFiltersOpen(false);
  });

  const [events] = createResource(
    () => [selectedProvinces().join(","), selectedOrgIds().join(",")] as const,
    async ([provinces, orgIds]) => {
      const query = new URLSearchParams();
      if (provinces) query.set("province", provinces);
      if (orgIds) query.set("org", orgIds);
      const qs = query.toString();
      const result = await apiFetch(`/api/events${qs ? `?${qs}` : ""}`, {
        response: ListEventsResponseSchema,
      });
      return result.match(
        (data) => data.events,
        () => [],
      );
    },
  );

  // Also powers the organization filter's options - only ~12 orgs exist, so
  // the already-fetched list is filtered client-side rather than searched
  // server-side (unlike the much larger account-name search elsewhere).
  const [organizations] = createResource(async () => {
    const result = await apiFetch("/api/organizations", {
      response: ListOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  // EventJson only carries publisherOrgId, not the org's own name/slug/logo -
  // build a lookup for the flyer-less-event thumbnail fallback (see
  // EventThumbnail) and for the card's "published by" org link.
  const orgById = createMemo(() => new Map(organizations()?.map((org) => [org.id, org]) ?? []));

  const provinceOptions = PROVINCES.map((province) => ({ value: province, label: province }));
  const organizationOptions = createMemo(
    () => organizations()?.map((org) => ({ value: org.id, label: org.name })) ?? [],
  );
  const hasActiveFilters = () =>
    selectedProvinces().length > 0 || selectedOrgIds().length > 0 || selectedWeekdays().length > 0;

  // Weekday filtering only depends on startAt, already present on every
  // fetched event, so - unlike province/org - it's applied client-side
  // rather than round-tripped through the API. Also drops events that have
  // already ended (or, absent an end time, already started) - the same
  // "not-yet-ended" rule the repository already applies for the org-detail
  // and .ics listings (`coalesce(end_at, start_at) >= now()`), just not yet
  // for this default listing, which still returns full history.
  const visibleEvents = createMemo(() => {
    const weekdays = selectedWeekdays();
    const now = Date.now();
    const upcoming = (events() ?? []).filter(
      (event) => new Date(event.endAt ?? event.startAt).getTime() >= now,
    );
    if (weekdays.length === 0) return upcoming;
    const allowed = new Set(weekdays);
    return upcoming.filter((event) =>
      allowed.has(WEEKDAY_CODE_BY_JS_DAY[new Date(event.startAt).getDay()]),
    );
  });

  // Chronological, then bucketed: everything left in the current
  // Monday-Sunday week (visibleEvents already dropped anything that's
  // over, so in practice this is just "from now until Sunday") collapses
  // into a single divider - "This weekend" once it's Friday 17:00 or
  // later, "This week" before that - and everything past that week keeps
  // the plain month divider it always had (startAt is a fixed-format ISO
  // string, so plain string comparison already sorts it chronologically).
  const eventGroups = (): EventGroup[] => {
    const sorted = [...visibleEvents()].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + 7);
    const weekendStart = new Date(weekEnd);
    weekendStart.setDate(weekendStart.getDate() - 3);
    weekendStart.setHours(17, 0, 0, 0);
    const currentBucketLabel =
      now >= weekendStart ? t("Dit weekend", "This weekend") : t("Deze week", "This week");

    const groups: EventGroup[] = [];
    for (const event of sorted) {
      const date = new Date(event.startAt);
      const key = date < weekEnd ? "current" : `${date.getFullYear()}-${date.getMonth()}`;
      const label =
        date < weekEnd
          ? currentBucketLabel
          : date.toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
              month: "long",
              year: "numeric",
            });
      const current = groups.at(-1);
      if (current?.key === key) {
        current.items.push(event);
      } else {
        groups.push({ key, label, items: [event] });
      }
    }
    return groups;
  };

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Evenementen", "Events")} — Vegan Activists NL</Title>

      <Show when={eventsSignalGroup}>
        {(group) => (
          <div class="mb-6 flex flex-col items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {t(
                "Nog niet alle evenementen staan al in deze kalender: veel worden eerst gedeeld in de events Signal-groep. Wil je niets missen?",
                "Not every event is listed here yet: many are first shared in the events Signal group. Want to make sure you don't miss any?",
              )}
            </p>
            <a
              href={group().url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 no-underline"
            >
              {t("Word lid van de events Signal-groep", "Join the events Signal group")}
            </a>
          </div>
        )}
      </Show>

      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Evenementen", "Events")}</h1>
        <Show when={me()}>
          <a
            href={`/${lang()}/events/new`}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t("Maak evenement", "Create event")}
          </a>
        </Show>
      </div>

      <div
        ref={filterBarRef}
        class={`sticky top-[40px] z-30 mb-8 nav:relative nav:top-auto nav:mx-0 ${docked() ? "-mx-6" : ""}`}
      >
        <div
          class={`transition-[border-radius] nav:rounded-2xl nav:border nav:border-zinc-200 nav:bg-white/90 nav:shadow-sm nav:backdrop-blur-sm ${
            docked()
              ? "border-b border-zinc-200 bg-white shadow-sm"
              : "rounded-2xl border border-zinc-200 bg-white/90 shadow-sm backdrop-blur-sm"
          }`}
        >
          <button
            type="button"
            class={`flex w-full items-center justify-between gap-3 text-left transition hover:bg-zinc-50 nav:rounded-2xl nav:px-4 nav:py-3 ${
              docked() ? "px-6 py-2.5" : "rounded-2xl px-4 py-3"
            }`}
            aria-expanded={filtersOpen()}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span class="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <FilterIcon class="h-4 w-4 text-emerald-600" />
              {t("Filters", "Filters")}
              <Show when={hasActiveFilters()}>
                <span class="rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {selectedProvinces().length + selectedOrgIds().length + selectedWeekdays().length}
                </span>
              </Show>
            </span>
            <ChevronDownIcon
              class={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${filtersOpen() ? "rotate-180" : "rotate-0"}`}
            />
          </button>

          <Show when={!filtersOpen() && hasActiveFilters()}>
            <div
              class={`flex flex-wrap items-center gap-1.5 pb-3 nav:px-4 ${docked() ? "px-6" : "px-4"}`}
            >
              <For each={selectedProvinces()}>
                {(province) => (
                  <span class="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    {province}
                    <button
                      type="button"
                      class="text-emerald-600 hover:text-emerald-900"
                      aria-label={`Remove ${province}`}
                      onClick={() => removeProvince(province)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </For>
              <For each={selectedOrgIds()}>
                {(orgId) => (
                  <span class="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    {orgById().get(orgId)?.name ?? orgId}
                    <button
                      type="button"
                      class="text-emerald-600 hover:text-emerald-900"
                      aria-label="Remove organization filter"
                      onClick={() => removeOrg(orgId)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </For>
              <For each={selectedWeekdays()}>
                {(value) => (
                  <span class="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    {t(
                      WEEKDAYS.find((d) => d.value === value)?.labelNl ?? value,
                      WEEKDAYS.find((d) => d.value === value)?.labelEn ?? value,
                    )}
                    <button
                      type="button"
                      class="text-emerald-600 hover:text-emerald-900"
                      aria-label={`Remove ${value}`}
                      onClick={() => toggleWeekday(value)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </For>
              <button
                type="button"
                class="ml-1 text-xs text-zinc-500 underline hover:text-zinc-700"
                onClick={clearAllFilters}
              >
                {t("Alles wissen", "Clear all")}
              </button>
            </div>
          </Show>

          <Show when={filtersOpen()}>
            <div
              class={`flex flex-col gap-3 border-t border-zinc-100 py-4 sm:flex-row sm:flex-wrap sm:items-end nav:px-4 ${docked() ? "px-6" : "px-4"}`}
            >
              <div class="w-full sm:w-56">
                <MultiSelectAutocomplete
                  label={t("Provincie", "Province")}
                  placeholder={t("Alle provincies", "All provinces")}
                  options={provinceOptions}
                  selected={selectedProvinces()}
                  onChange={setProvinceFilter}
                  noResultsLabel={t("Geen provincies gevonden", "No provinces found")}
                />
              </div>
              <div class="w-full sm:w-56">
                <MultiSelectAutocomplete
                  label={t("Organisatie", "Organization")}
                  placeholder={t("Alle organisaties", "All organizations")}
                  options={organizationOptions()}
                  selected={selectedOrgIds()}
                  onChange={setOrgFilter}
                  noResultsLabel={t("Geen organisaties gevonden", "No organizations found")}
                />
              </div>
              <div class="w-full sm:w-auto">
                <span class="block text-sm font-medium text-zinc-700">
                  {t("Dag van de week", "Day of week")}
                </span>
                <div class="mt-1 flex flex-wrap gap-1.5">
                  <For each={WEEKDAYS}>
                    {(day) => (
                      <button
                        type="button"
                        aria-pressed={selectedWeekdays().includes(day.value)}
                        class={`rounded-lg border px-2.5 py-1.5 text-sm transition ${
                          selectedWeekdays().includes(day.value)
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
                        }`}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {t(day.labelNl, day.labelEn)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
              <Show when={hasActiveFilters()}>
                <button
                  type="button"
                  class="w-full shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 sm:w-auto"
                  onClick={clearAllFilters}
                >
                  {t("Filters wissen", "Clear filters")}
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <Show
        when={!events.loading}
        fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
      >
        <Show
          when={visibleEvents().length > 0}
          fallback={
            <p class="text-zinc-600">
              {hasActiveFilters()
                ? t(
                    "Geen evenementen gevonden voor deze filters.",
                    "No events match these filters.",
                  )
                : t("Nog geen evenementen.", "No events yet.")}
            </p>
          }
        >
          <div class="space-y-8">
            <For each={eventGroups()}>
              {(group) => (
                <section>
                  <div class="mb-4 flex items-center gap-4">
                    <div class="h-px flex-1 bg-zinc-300" />
                    <h2 class="shrink-0 text-sm font-semibold tracking-widest text-zinc-500 uppercase">
                      {group.label}
                    </h2>
                    <div class="h-px flex-1 bg-zinc-300" />
                  </div>
                  <ul class="space-y-4">
                    <For each={group.items}>
                      {(event) => (
                        <li class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                          <EventCard
                            event={event}
                            lang={lang()}
                            href={`/${lang()}/events/${event.slug}`}
                            orgLogoThumbnailImageId={
                              event.publisherOrgId
                                ? (orgById()?.get(event.publisherOrgId)?.logoThumbnailImageId ??
                                  null)
                                : null
                            }
                            org={
                              event.publisherOrgId
                                ? orgById()?.get(event.publisherOrgId)
                                : undefined
                            }
                            statusLabel={statusLabels[event.status]}
                          />
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={!me.loading && !me()}>
        <p class="mt-8 text-center text-sm text-zinc-600">
          {t("Wil je een evenement maken? ", "Want to create an event? ")}
          <a href={`/${lang()}/signup-help`} class="underline">
            {t("Meld je aan om een account te maken.", "Sign up to create an account.")}
          </a>
        </p>
      </Show>
    </main>
  );
}
