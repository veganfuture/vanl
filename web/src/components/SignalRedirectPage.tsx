import { onMount } from "solid-js";

export function SignalRedirectPage(props: { url: string }) {
  onMount(() => {
    window.location.replace(props.url);
  });

  return (
    <main class="flex min-h-screen items-center justify-center bg-white">
      <div class="mx-auto max-w-xl p-6 text-center">
        <meta http-equiv="refresh" content={`0;url=${props.url}`} />
        <h1 class="mb-2 text-2xl font-semibold">Redirecting…</h1>
        <p class="text-zinc-600">
          Opening the Signal group. If nothing happens,{" "}
          <a href={props.url} class="underline">
            continue here
          </a>
          .
        </p>
      </div>
    </main>
  );
}
