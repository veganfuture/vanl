import { Locale } from "@/lib/i18n";
import { GroupInfo } from "@/lib/groups";
import { GroupsAccordion, GroupsAccordionDict } from "@/components/GroupsAccordion";
import Image from "next/image";

export type LandingDict = {
  siteTitle: string;
  siteTag: string;
  heroTitleA: string;
  heroTitleB: string;
  heroBody: string;
  bullets1: string;
  bullets2: string;
  bullets3: string;
  whyTitle: string;
  whyBody: string;
  admissionTitle: string;
  admissionBody: string;
  safetyTitle: string;
  safetyBody: string;
  groupsHeading: string;
  footer: string;
  groupAccordion: GroupsAccordionDict,
};

export type LandingProps = {
  dict: LandingDict;
  locale: Locale;
  groups: GroupInfo[]
};

export function Landing({ dict, locale, groups }: LandingProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 text-zinc-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex "><Image src="/apple-touch-icon.png" width={52} height={52} alt={"Vegan Activists NL logo"} /></span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{dict.siteTitle}</h1>
            <p className="text-xs text-zinc-600">{dict.siteTag}</p>
          </div>
        </div>

        <details className="relative group">
          <summary
            className="list-none flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:border-zinc-400"
          >
            <span>
              {locale === "nl" ? "🇳🇱 Nederlands" : "🇬🇧 English"}
            </span>
            <svg
              className="h-3 w-3 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>

          <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
            <a href="/nl" className="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50">
              🇳🇱 Nederlands
            </a>
            <a href="/en" className="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50">
              🇬🇧 English
            </a>
          </div>
        </details>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-6 pb-16 md:pb-24">
        <h2 className="mb-4 text-4xl font-extrabold tracking-tight md:text-5xl">
          {dict.heroTitleA} <span className="text-emerald-700">{dict.heroTitleB}</span>
        </h2>
        <p className="mb-6 max-w-3xl text-lg text-zinc-700">{dict.heroBody}</p>

        <h3 className="mb-2 text-sm font-semibold text-zinc-700">{dict.groupsHeading}</h3>
        <GroupsAccordion
          groups={groups}
          locale={locale}
          dict={dict.groupAccordion}
        />

        <ul className="mt-6 space-y-2 text-sm text-zinc-600">
          <li>• {dict.bullets1}</li>
          <li>• {dict.bullets2}</li>
          <li>• {dict.bullets3}</li>
        </ul>
      </section>

      <section className="border-y border-emerald-100 bg-white/60">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-3">
          <div>
            <h4 className="font-semibold">{dict.whyTitle}</h4>
            <p className="text-sm text-zinc-600">{dict.whyBody}</p>
          </div>
          <div>
            <h4 className="font-semibold">{dict.admissionTitle}</h4>
            <p className="text-sm text-zinc-600">{dict.admissionBody}</p>
          </div>
          <div>
            <h4 className="font-semibold">{dict.safetyTitle}</h4>
            <p className="text-sm text-zinc-600">{dict.safetyBody}</p>
          </div>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-zinc-600">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>{dict.footer}</p>
        </div>
      </footer>
    </main>);
}