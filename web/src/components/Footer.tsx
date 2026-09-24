import { useLang } from "~/lib/i18n";

/** Rendered once in app.tsx's root layout, like Navbar - shared across every page, not just the landing page. */
export function Footer() {
  const { t } = useLang();

  return (
    <footer class="mt-0 border-t border-zinc-200 bg-white/70">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <img
            src="/apple-touch-icon.png"
            width={36}
            height={36}
            alt=""
            class="rounded-lg shrink-0"
          />
          <div>
            <p class="text-sm font-semibold text-zinc-900">VeganActivists.nl</p>
            <p class="text-xs text-zinc-500">
              {t(
                "Vrij te gebruiken. Geen rechten voorbehouden. Met liefde van ",
                "Free to use. No rights reserved. With love from ",
              )}
              <a href="https://veganfuture.org">Vegan Future</a>💚
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
