"use client";
import Image from "next/image";
import { useId, useState } from "react";
import { CopyButton } from "./CopyButton";
import { GroupInfo } from "@/lib/groups";
import { Locale } from "@/lib/i18n";


export type GroupsAccordionDict = {
  openInSignal: string;
  downloadQr: string;
  copyLabel: string;
  copySuccess: string;
};

export function GroupsAccordion({
  groups,
  locale,
  dict,
  defaultOpen = 0,
}: {
  groups: GroupInfo[];
  locale: Locale;
  dict: GroupsAccordionDict;
  defaultOpen?: number;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);
  const baseId = useId();

  return (
    <ul className="rounded-2xl border border-zinc-200 bg-white/70 shadow-sm divide-y divide-zinc-200">
      {groups.map((g, idx) => {
        const isOpen = openIndex === idx;
        const btnId = `${baseId}-btn-${g.id}`;
        const panelId = `${baseId}-panel-${g.id}`;
        return (
          <li key={g.id}>
            <button
              id={btnId}
              aria-controls={panelId}
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left no-underline"
            >
              <div>
                <div className="font-medium">{g.title}</div>
                <div className="text-sm text-zinc-600">{g.description[locale]}</div>
              </div>
              {/* caret */}
              <svg
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${isOpen ? "rotate-180" : "rotate-0"}`}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isOpen && (
              <div id={panelId} role="region" aria-labelledby={btnId} className="px-4 pb-4 pt-1">
                <div className="mt-2 grid items-center gap-4 sm:grid-cols-[auto,1fr]">
                  <div className="flex items-center justify-center">
                    <div className="relative h-48 w-48 sm:h-56 sm:w-56">
                      <Image
                        src={g.qrImage}
                        alt={`QR for ${g.title}`}
                        fill
                        className="rounded-xl border border-zinc-200 object-contain"
                        sizes="(max-width: 768px) 192px, 224px"
                        priority
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3">
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 no-underline"
                    >
                      {dict.openInSignal}
                    </a>
                    <CopyButton 
                      text={g.url} 
                      label={dict.copyLabel} 
                      success={dict.copySuccess} 
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:border-zinc-400  no-underline"
                    />
                    <a
                      href={g.qrImage}
                      download
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:border-zinc-400  no-underline"
                    >
                      {dict.downloadQr}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
