"use client";

import { useEffect } from "react";

type SignalRedirectPageProps = {
  url: string;
};

export default function SignalRedirectPage({
  url,
}: SignalRedirectPageProps) {
  useEffect(() => {
    window.location.replace(url);
  }, [url]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="mx-auto max-w-xl p-6 text-center">
        <meta httpEquiv="refresh" content={`0;url=${url}`} />
        <h1 className="mb-2 text-2xl font-semibold">Redirecting…</h1>
        <p className="text-zinc-600">
          Opening the Signal group. If nothing happens,{" "}
          <a href={url} className="underline">
            continue here
          </a>
          .
        </p>
      </div>
    </main>
  );
}
