import { HttpStatusCode } from "@solidjs/start";

export default function NotFound() {
  return (
    <main class="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <HttpStatusCode code={404} />
      <div class="max-w-md">
        <h1 class="mb-2 text-2xl font-semibold text-zinc-900">Page not found</h1>
        <p class="mb-4 text-zinc-600">Pagina niet gevonden.</p>
        <p class="text-sm text-zinc-600">
          <a href="/nl" class="underline">
            Nederlands
          </a>{" "}
          |{" "}
          <a href="/en" class="underline">
            English
          </a>
        </p>
      </div>
    </main>
  );
}
