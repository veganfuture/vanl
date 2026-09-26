import { useSearchParams } from "@solidjs/router";
import { createSignal, onMount } from "solid-js";
import type { Locale } from "~/lib/i18n";

/**
 * Central registry of toast messages, keyed by a short id passed as a
 * `?toast=<key>` query param on a redirect. Adding a new toast anywhere in
 * the app is just adding an entry here - no page needs to know or construct
 * message text itself.
 */
export const TOAST_MESSAGES = {
  event_published: {
    nl: "Je evenement staat online! Het kan een paar minuten duren voordat het voor andere bezoekers zichtbaar is en een paar uur voor het op externe kalenders zichtbaar zal zijn (bijv. animalrightscalendar.com).",
    en: "Your event is live! It may take a few minutes to appear on the public events list for other visitors. It may take a few hours before your event appears on external calendars (e.g. animalrightscalendar.com).",
  },
  events_published_multi: {
    nl: "Je evenementen staan online! Het kan een paar minuten duren voordat ze voor andere bezoekers zichtbaar zijn en een paar uur voor ze op externe kalenders zichtbaar zullen zijn (bijv. animalrightscalendar.com).",
    en: "Your events are live! It may take a few minutes to appear on the public events list for other visitors. It may take a few hours before they appear on external calendars (e.g. animalrightscalendar.com).",
  },
  organization_published: {
    nl: "Je organisatieprofiel staat online! Het kan een paar minuten duren voordat het voor andere bezoekers zichtbaar is.",
    en: "Your organization profile is live! It may take a few minutes to appear for other visitors.",
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type ToastKey = keyof typeof TOAST_MESSAGES;

function isToastKey(value: string): value is ToastKey {
  return value in TOAST_MESSAGES;
}

/**
 * Reads a `?toast=<key>` query param left by a redirect (see TOAST_MESSAGES),
 * resolves it to the current locale's text, and strips the param from the
 * URL immediately so a refresh or shared link doesn't re-show it - the
 * resolved message itself lives in a signal, independent of the URL, so it
 * stays visible for its own dismiss timeout regardless.
 */
export function useQueryToast(lang: () => Locale): [() => string | null, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.toast;
  const key = typeof raw === "string" && isToastKey(raw) ? raw : null;

  const [message, setMessage] = createSignal<string | null>(
    key ? TOAST_MESSAGES[key][lang()] : null,
  );

  // Only mutate the URL client-side (never during SSR) - the initial render
  // still shows the toast immediately from the SSR'd `?toast=` param, this
  // just scrubs it from the address bar afterward so a refresh or shared
  // link doesn't re-show it.
  onMount(() => {
    if (key) {
      setSearchParams({ toast: undefined }, { replace: true });
    }
  });

  return [message, () => setMessage(null)];
}
