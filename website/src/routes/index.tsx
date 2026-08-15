import { onMount } from "solid-js";
import { LOCALE_COOKIE_NAME } from "~/lib/i18n";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Static index that client-redirects by sticky preference, falling back to
// browser locale. No backend needed - the redirect target has to be decided
// client-side either way (Accept-Language sniffing server-side would make
// this response un-cacheable), so a cookie read costs nothing extra here.
export default function Index() {
  onMount(() => {
    const sticky = readCookie(LOCALE_COOKIE_NAME);
    let target: string;
    if (sticky === "nl" || sticky === "en") {
      target = `/${sticky}`;
    } else {
      const langs = (
        navigator.languages && navigator.languages.length
          ? navigator.languages
          : [navigator.language]
      ).map((l) => l?.toLowerCase?.() || "");
      const isDutch = langs.some((l) => l.startsWith("nl"));
      target = isDutch ? "/nl" : "/en";
    }
    const { hash, search } = window.location;
    window.location.replace(target + (search || "") + (hash || ""));
  });

  return (
    <main class="min-h-screen flex items-center justify-center bg-white">
      <div class="mx-auto max-w-xl p-6 text-center">
        <h1 class="text-2xl font-semibold mb-2">VeganActivists.nl</h1>
        <p class="text-zinc-600">Redirecting… / Bezig met doorsturen…</p>
        <noscript>
          <p class="mt-4">
            JavaScript is required to auto-select your language. Choose manually:{" "}
            <a href="/nl" class="underline">
              Nederlands
            </a>{" "}
            |{" "}
            <a href="/en" class="underline">
              English
            </a>
          </p>
        </noscript>
      </div>
    </main>
  );
}
