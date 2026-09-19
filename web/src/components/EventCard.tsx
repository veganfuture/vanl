import { Show } from "solid-js";
import { BuildingIcon, CalendarIcon, MapPinIcon } from "~/components/icons";
import { EventThumbnail } from "~/components/EventThumbnail";
import { formatEventDate } from "~/lib/format-date";
import { pickLocalized, type Locale } from "~/lib/i18n";
import type { EventJson } from "~/routes/api/events/event.schema";

/**
 * The event row shown on the events overview, an organization's "next
 * event" teaser, and an organization's upcoming-events list. Every card is
 * exactly two lines tall - a truncated title and a truncated "date · place
 * · org" meta line - so cards line up at a uniform, compact height
 * regardless of how long the title is or how many of the optional bits
 * (place, org, status badge) are present. The place segment always shows
 * when `event.municipalityName` is set (resolved server-side by GET
 * /api/events - see event.schema.ts's toEventJson) - callers never pass it
 * in separately. The thumbnail fallback (`orgLogoThumbnailImageId`) is
 * always passed by every caller now, even on org-scoped pages where the
 * org's own logo is shown elsewhere on the page too - the card is meant to
 * look identical everywhere it appears, rather than varying by surface. The
 * status badge and the publishing org link are still opt-in via props: only
 * the events overview page passes `org` - on the other two surfaces the
 * publishing org is already obvious from the page itself.
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
    <div class="group flex items-center gap-4">
      <EventThumbnail
        flyerThumbnailImageId={props.event.flyerThumbnailImageId}
        orgLogoThumbnailImageId={props.orgLogoThumbnailImageId}
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <a
            href={props.href}
            class="min-w-0 flex-1 truncate text-lg leading-snug font-semibold text-zinc-900 no-underline transition-colors group-hover:text-emerald-700"
          >
            {pickLocalized(props.event.titleNl, props.event.titleEn, props.lang)}
          </a>
          <Show when={props.statusLabel}>
            {(label) => (
              <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {label()}
                {props.event.statusReason ? ` — ${props.event.statusReason}` : ""}
              </span>
            )}
          </Show>
        </div>
        <p class="mt-1 truncate text-sm text-zinc-600">
          <CalendarIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
          <span>
            {formatEventDate(props.event.startAt, props.lang, props.event.startTimeKnown)}
          </span>
          <Show when={props.event.municipalityName}>
            {(name) => (
              <>
                <span class="mx-1.5 text-zinc-300">·</span>
                <MapPinIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
                <span>{name()}</span>
              </>
            )}
          </Show>
          <Show when={props.org}>
            {(org) => (
              <>
                <span class="mx-1.5 text-zinc-300">·</span>
                <BuildingIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
                <a
                  href={`/${props.lang}/organizations/${org().slug}`}
                  class="text-zinc-600 hover:text-emerald-700 hover:underline"
                >
                  {org().name}
                </a>
              </>
            )}
          </Show>
        </p>
      </div>
    </div>
  );
}
