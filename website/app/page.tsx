"use client";
// Static index that client-redirects by browser locale. No backend needed.
import { useEffect } from "react";

export default function Index() {
  useEffect(() => {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])
      .map(l => l?.toLowerCase?.() || "");
    const isDutch = langs.some(l => l.startsWith("nl"));
    const target = isDutch ? "/nl" : "/en";
    // preserve hash/query if any
    const { hash, search } = window.location;
    window.location.replace(target + (search || "") + (hash || ""));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="mx-auto max-w-xl p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">VeganActivists.nl</h1>
        <p className="text-zinc-600">Redirecting… / Bezig met doorsturen…</p>
        <noscript>
          <p className="mt-4">
            JavaScript is required to auto-select your language. Choose manually:
            {" "}
            <a href="/nl" className="underline">Nederlands</a> | <a href="/en" className="underline">English</a>
          </p>
        </noscript>
      </div>
    </main>
  );
}
