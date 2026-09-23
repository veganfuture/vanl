import { HttpStatusCode } from "@solidjs/start";

export function NotFound() {
  return (
    <main class="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-emerald-50 px-6 text-center">
      <HttpStatusCode code={404} />
      <div class="max-w-md">
        <p class="mb-3 text-6xl">🌱</p>
        <h1 class="mb-4 text-2xl font-extrabold tracking-tight text-zinc-900">404</h1>
        <p class="mb-1 text-zinc-700">
          This page doesn't exist. Neither should animal agriculture.{" "}
          <span class="font-semibold text-emerald-700">Go vegan.</span>
        </p>
        <p class="mb-6 text-sm text-zinc-500">
          Deze pagina bestaat niet. Dierenlandbouw zou ook niet moeten bestaan.{" "}
          <span class="font-semibold text-emerald-700">Word vegan.</span>
        </p>
        <p class="text-sm text-zinc-600">
          <a href="/nl" class="underline decoration-emerald-300 underline-offset-2">
            Nederlands
          </a>{" "}
          |{" "}
          <a href="/en" class="underline decoration-emerald-300 underline-offset-2">
            English
          </a>
        </p>
      </div>
    </main>
  );
}
