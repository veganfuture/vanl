import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { Landing } from "~/components/Landing";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { NotFound } from "~/components/NotFound";
import { GROUPS } from "~/lib/groups";
import { resolveLang } from "~/lib/i18n";
import { BASE_URL } from "~/lib/metadata";

export default function LandingPage() {
  const params = useParams<{ lang: string }>();
  const isValidLang = () => params.lang === "nl" || params.lang === "en";
  const lang = () => resolveLang(params.lang);

  return (
    // [lang] matches any single path segment, so a stale/garbage value here
    // (e.g. someone hitting the old unprefixed /events or /login) must not
    // silently render the landing page - fall through to a real 404 instead.
    <Show when={isValidLang()} fallback={<NotFound />}>
      <LocaleCookieSync lang={lang()} />
      <Title>VeganActivists.nl</Title>
      <Meta property="og:locale" content={lang() === "nl" ? "nl_NL" : "en_US"} />
      <Link rel="alternate" hreflang="en" href={`${BASE_URL}/en`} />
      <Link rel="alternate" hreflang="nl" href={`${BASE_URL}/nl`} />
      <Landing lang={lang()} groups={GROUPS} />
    </Show>
  );
}
