import type { Locale } from "~/lib/i18n";
import type { GroupInfo } from "~/lib/groups";
import { GroupsAccordion, type GroupsAccordionDict } from "./GroupsAccordion";

export type LandingDict = {
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
  groupAccordion: GroupsAccordionDict;
};

export type LandingProps = {
  dict: LandingDict;
  locale: Locale;
  groups: GroupInfo[];
};

export function Landing(props: LandingProps) {
  return (
    <main class="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 text-zinc-900">
      <section class="mx-auto max-w-6xl px-6 pt-6 pb-16 md:pb-24">
        <h2 class="mb-4 text-4xl font-extrabold tracking-tight md:text-5xl">
          {props.dict.heroTitleA} <span class="text-emerald-700">{props.dict.heroTitleB}</span>
        </h2>
        <p class="mb-6 max-w-3xl text-lg text-zinc-700">{props.dict.heroBody}</p>

        <h3 class="mb-2 text-sm font-semibold text-zinc-700">{props.dict.groupsHeading}</h3>
        <GroupsAccordion
          groups={props.groups}
          locale={props.locale}
          dict={props.dict.groupAccordion}
        />

        <ul class="mt-6 space-y-2 text-sm text-zinc-600">
          <li>• {props.dict.bullets1}</li>
          <li>• {props.dict.bullets2}</li>
          <li>• {props.dict.bullets3}</li>
        </ul>
      </section>

      <section class="border-y border-emerald-100 bg-white/60">
        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-3">
          <div>
            <h4 class="font-semibold">{props.dict.whyTitle}</h4>
            <p class="text-sm text-zinc-600">{props.dict.whyBody}</p>
          </div>
          <div>
            <h4 class="font-semibold">{props.dict.admissionTitle}</h4>
            <p class="text-sm text-zinc-600">{props.dict.admissionBody}</p>
          </div>
          <div>
            <h4 class="font-semibold">{props.dict.safetyTitle}</h4>
            <p class="text-sm text-zinc-600">{props.dict.safetyBody}</p>
          </div>
        </div>
      </section>

      <footer class="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-zinc-600">
        <div class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>{props.dict.footer}</p>
        </div>
      </footer>
    </main>
  );
}
