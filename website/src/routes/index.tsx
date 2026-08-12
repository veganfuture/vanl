import { onMount } from "solid-js";

// Static index that client-redirects by browser locale. No backend needed.
export default function Index() {
  onMount(() => {
    const langs = (
      navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]
    ).map((l) => l?.toLowerCase?.() || "");
    const isDutch = langs.some((l) => l.startsWith("nl"));
    const target = isDutch ? "/nl" : "/en";
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
