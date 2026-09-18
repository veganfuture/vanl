import { Show } from "solid-js";
import { EventThumbnail } from "~/components/EventThumbnail";
import { formatEventDate } from "~/lib/format-date";
import { pickLocalized, type Locale } from "~/lib/i18n";
import type { EventJson } from "~/routes/api/events/event.schema";

/**
 * The event row shown on the events overview, an organization's "next
 * event" teaser, and an organization's upcoming-events list. The place row
 * always shows when `event.municipalityName` is set (resolved server-side
 * by GET /api/events - see event.schema.ts's toEventJson) - callers never
 * pass it in separately. Thumbnail fallback, the status badge, and the
 * publishing org link are still opt-in via props: e.g. the org "next event"
 * teaser omits `orgLogoThumbnailImageId` on purpose (the org's own logo is
 * already shown right next to it, so falling back to it here would just
 * repeat it), and only the events overview page passes `org` - on the other
 * two surfaces the publishing org is already obvious from the page itself.
 */
export function EventCard(props: {
  event: EventJson;
  lang: Locale;
  href: string;
  orgLogoThumbnailImageId?: string | null;
  org?: { name: string; slug: string };
  statusLabel?: string;
}) {
  return (
    <div class="group flex items-start gap-4">
      <EventThumbnail
        flyerThumbnailImageId={props.event.flyerThumbnailImageId}
        orgLogoThumbnailImageId={props.orgLogoThumbnailImageId}
      />
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={props.href}
            class="text-lg leading-snug font-semibold text-zinc-900 no-underline transition-colors group-hover:text-emerald-700"
          >
            {pickLocalized(props.event.titleNl, props.event.titleEn, props.lang)}
          </a>
          <Show when={props.statusLabel}>
            {(label) => (
              <span class="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {label()}
                {props.event.statusReason ? ` — ${props.event.statusReason}` : ""}
              </span>
            )}
          </Show>
        </div>
        <div class="mt-1.5 flex flex-col gap-1.5">
          <p class="flex items-center gap-1.5 text-sm text-zinc-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              class="h-4 w-4 shrink-0 text-emerald-500"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              />
            </svg>
            <span>{formatEventDate(props.event.startAt, props.lang)}</span>
          </p>
          <Show when={props.org}>
            {(org) => (
              <p class="flex items-center gap-1.5 text-sm text-zinc-600">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="h-4 w-4 shrink-0 text-zinc-400"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                  />
                </svg>
                <a
                  href={`/${props.lang}/organizations/${org().slug}`}
                  class="text-zinc-600 hover:text-emerald-700 hover:underline"
                >
                  {org().name}
                </a>
              </p>
            )}
          </Show>
          <Show when={props.event.municipalityName}>
            {(name) => (
              <p class="flex items-center gap-1.5 text-sm text-zinc-600">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="h-4 w-4 shrink-0 text-zinc-400"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                  />
                </svg>
                <span>{name()}</span>
              </p>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
