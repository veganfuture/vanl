import { Show } from "solid-js";
import { BuildingIcon, CalendarIcon, MapPinIcon } from "~/components/icons";
import { EventThumbnail } from "~/components/EventThumbnail";
import { formatEventDate } from "~/lib/format-date";
import { pickLocalized, type Locale } from "~/lib/i18n";
import type { EventJson } from "~/routes/api/events/event.schema";

/**
 * The event row shown on the events overview, an organization's "next
 * event" teaser, and an organization's upcoming-events list. Above the `sm`
 * breakpoint every card is exactly two lines tall - a truncated title and a
 * truncated "date · place · org" meta line - so cards line up at a uniform,
 * compact height regardless of how long the title is or how many of the
 * optional bits (place, org, status badge) are present. Below `sm` the meta
 * bits stack vertically instead (one per line, no dots, no truncation) since
 * there isn't enough width to keep them on one line without clipping - cards
 * there vary in height with however many bits are present. Also below `sm`,
 * the thumbnail sits next to the title in its own header row (via
 * `sm:contents`, same trick as the organization list card) instead of
 * indenting the whole text column, so the meta line isn't squeezed into a
 * narrower strip than it needs on small screens; this duplicates the title
 * (and status badge) markup once per breakpoint since the two layouts group
 * the thumbnail with different siblings. The place segment always shows
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
  const title = () => pickLocalized(props.event.titleNl, props.event.titleEn, props.lang);

  const statusBadge = () => (
    <Show when={props.statusLabel}>
      {(label) => (
        <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          {label()}
          {props.event.statusReason ? ` — ${props.event.statusReason}` : ""}
        </span>
      )}
    </Show>
  );

  return (
    <div class="group flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div class="flex items-center gap-3 sm:contents">
        <EventThumbnail
          flyerThumbnailImageId={props.event.flyerThumbnailImageId}
          orgLogoThumbnailImageId={props.orgLogoThumbnailImageId}
        />
        <a
          href={props.href}
          class="min-w-0 flex-1 truncate text-lg leading-snug font-semibold text-zinc-900 no-underline transition-colors group-hover:text-emerald-700 sm:hidden"
        >
          {title()}
        </a>
        <div class="sm:hidden">{statusBadge()}</div>
      </div>
      <div class="min-w-0 flex-1">
        <div class="hidden items-center gap-2 sm:flex">
          <a
            href={props.href}
            class="min-w-0 flex-1 truncate text-lg leading-snug font-semibold text-zinc-900 no-underline transition-colors group-hover:text-emerald-700"
          >
            {title()}
          </a>
          {statusBadge()}
        </div>
        <div class="mt-2 flex flex-col gap-1.5 text-sm text-zinc-600 sm:mt-1 sm:flex-row sm:items-center sm:gap-0 sm:truncate">
          <span class="flex items-center">
            <CalendarIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
            <span>
              {formatEventDate(props.event.startAt, props.lang, props.event.startTimeKnown)}
            </span>
          </span>
          <Show when={props.event.municipalityName}>
            {(name) => (
              <span class="flex items-center">
                <span class="hidden text-zinc-300 sm:mx-1.5 sm:inline">·</span>
                <MapPinIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
                <span>{name()}</span>
              </span>
            )}
          </Show>
          <Show when={props.org}>
            {(org) => (
              <span class="flex items-center">
                <span class="hidden text-zinc-300 sm:mx-1.5 sm:inline">·</span>
                <BuildingIcon class="mr-1 inline-block h-4 w-4 shrink-0 align-text-bottom text-emerald-500" />
                <a
                  href={`/${props.lang}/organizations/${org().slug}`}
                  class="text-zinc-600 hover:text-emerald-700 hover:underline"
                >
                  {org().name}
                </a>
              </span>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
