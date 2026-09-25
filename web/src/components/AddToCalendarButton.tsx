import { createMemo, createSignal } from "solid-js";
import { CalendarIcon, ChevronDownIcon } from "~/components/icons";
import {
  buildIcsFile,
  downloadIcsFile,
  googleCalendarUrl,
  office365Url,
  outlookComUrl,
  type CalendarEventInput,
} from "~/lib/calendar-links";
import { pickLocalized, useLang } from "~/lib/i18n";
import type { EventJson } from "~/routes/api/events/event.schema";

/**
 * Dropdown of "usual suspect" calendar destinations for a single event.
 * Google/Outlook.com/Office 365 open their own web compose UI (no server
 * round trip needed - everything they need is already on EventJson); Apple
 * Calendar and everything else that only understands .ics files gets a
 * client-generated single-VEVENT download instead (see calendar-links.ts).
 */
export function AddToCalendarButton(props: { event: EventJson }) {
  const { lang, t } = useLang();
  const [open, setOpen] = createSignal(false);

  const calendarInput = createMemo<CalendarEventInput>(() => {
    const ev = props.event;
    const locationParts = [
      ev.locationStreet && ev.locationHouseNumber
        ? `${ev.locationStreet} ${ev.locationHouseNumber}`
        : null,
      ev.locationPostcode,
      ev.locationDescription,
    ].filter((part): part is string => !!part);
    const descriptionParts = [
      pickLocalized(ev.descriptionNl, ev.descriptionEn, lang()).trim(),
      ev.externalEventUrl ? `${t("Meer info", "More info")}: ${ev.externalEventUrl}` : null,
      ev.registrationUrl ? `${t("Aanmelden", "Register")}: ${ev.registrationUrl}` : null,
    ].filter((part): part is string => !!part);

    return {
      title: pickLocalized(ev.titleNl, ev.titleEn, lang()),
      description: descriptionParts.join("\n\n"),
      location: locationParts.join(", "),
      startAt: ev.startAt,
      startTimeKnown: ev.startTimeKnown,
      endAt: ev.endAt,
    };
  });

  function onDownloadIcs() {
    const content = buildIcsFile({ ...calendarInput(), uid: props.event.id });
    downloadIcsFile(`${props.event.slug}.ics`, content);
    setOpen(false);
  }

  /** Matches the Navbar language-switcher dropdown's item styling (no-underline is needed here, unlike most links, since these render as plain anchors, not nav-style buttons) - kept identical so every dropdown menu on the site looks the same. */
  const menuItemClass =
    "block w-full px-3 py-2 text-left text-sm text-zinc-800 no-underline hover:bg-emerald-50";

  return (
    <div class="relative inline-block">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
        aria-haspopup="true"
        aria-expanded={open()}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <CalendarIcon class="h-5 w-5 text-emerald-500" />
        {t("Toevoegen aan agenda", "Add to calendar")}
        <ChevronDownIcon class="h-4 w-4 text-zinc-400" />
      </button>
      <ul
        class="absolute z-40 mt-2 w-60 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
        classList={{ hidden: !open() }}
      >
        <li>
          <a
            href={googleCalendarUrl(calendarInput())}
            target="_blank"
            rel="noreferrer"
            class={menuItemClass}
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
        </li>
        <li>
          <a
            href={outlookComUrl(calendarInput())}
            target="_blank"
            rel="noreferrer"
            class={menuItemClass}
            onClick={() => setOpen(false)}
          >
            Outlook.com
          </a>
        </li>
        <li>
          <a
            href={office365Url(calendarInput())}
            target="_blank"
            rel="noreferrer"
            class={menuItemClass}
            onClick={() => setOpen(false)}
          >
            Office 365
          </a>
        </li>
        <li>
          <button type="button" class={menuItemClass} onClick={onDownloadIcs}>
            {t("Apple Kalender / .ics-bestand", "Apple Calendar / .ics file")}
          </button>
        </li>
      </ul>
    </div>
  );
}
