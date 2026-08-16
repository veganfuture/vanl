import { createSignal, createUniqueId, For } from "solid-js";
import { CopyButton } from "./CopyButton";
import { SignalLink } from "./SignalLink";
import type { GroupInfo } from "~/lib/groups";
import type { Locale } from "~/lib/i18n";

export function GroupsAccordion(props: {
  groups: GroupInfo[];
  lang: Locale;
  defaultOpen?: number;
}) {
  const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);
  const [openIndex, setOpenIndex] = createSignal<number | null>(props.defaultOpen ?? 0);
  const baseId = createUniqueId();

  return (
    <ul class="rounded-2xl border border-zinc-200 bg-white/70 shadow-sm divide-y divide-zinc-200">
      <For each={props.groups}>
        {(g, idx) => {
          const isOpen = () => openIndex() === idx();
          const btnId = `${baseId}-btn-${g.id}`;
          const panelId = `${baseId}-panel-${g.id}`;
          return (
            <li>
              <button
                id={btnId}
                aria-controls={panelId}
                aria-expanded={isOpen()}
                onClick={() => setOpenIndex(isOpen() ? null : idx())}
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left no-underline"
              >
                <div>
                  <div class="font-medium">{g.title}</div>
                  <div class="text-sm text-zinc-600">{g.description[props.lang]}</div>
                </div>
                <svg
                  class={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${isOpen() ? "rotate-180" : "rotate-0"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>

              {isOpen() && (
                <div id={panelId} role="region" aria-labelledby={btnId} class="px-4 pb-4 pt-1">
                  <div class="mt-2 grid items-center gap-4 sm:grid-cols-[auto,1fr]">
                    <div class="flex items-center justify-center">
                      <div class="relative h-48 w-48 sm:h-56 sm:w-56">
                        <img
                          src={g.qrImage}
                          alt={`QR for ${g.title}`}
                          class="h-full w-full rounded-xl border border-zinc-200 object-contain"
                        />
                      </div>
                    </div>

                    <div class="flex flex-col items-start gap-3">
                      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 no-underline"
                        >
                          Open in Signal
                        </a>
                        <span class="text-sm text-zinc-600">
                          ({t("Nog geen Signal? ", "No Signal yet? ")}
                          <SignalLink lang={props.lang} />)
                        </span>
                      </div>
                      <CopyButton
                        text={g.url}
                        label={t("Link kopiëren", "Copy link")}
                        success={t("Link gekopieerd!", "Link copied!")}
                        class="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:border-zinc-400 no-underline"
                      />
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        }}
      </For>
    </ul>
  );
}
