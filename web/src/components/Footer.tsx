import { useLang } from "~/lib/i18n";

/** Rendered once in app.tsx's root layout, like Navbar - shared across every page, not just the landing page. */
export function Footer() {
  const { t } = useLang();

  return (
    <footer class="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-zinc-600">
      <div class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <p>
          {t(
            "Vrij te gebruiken. Geen rechten voorbehouden. Met liefde van Vegan Future 💚",
            "Free to use. No rights reserved. With love from Vegan Future 💚",
          )}
        </p>
      </div>
    </footer>
  );
}
