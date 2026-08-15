import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";

type NavLink = { label: string; href: string };

const SITE_TITLE = "VeganActivists.nl";
const SITE_TAG = "Together united for animal rights • Netherlands";

const linkClass =
  "block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";

function LanguageSwitcher(props: { onNavigate?: () => void }) {
  return (
    <details class="relative group">
      <summary class="list-none flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:border-zinc-400">
        <span>🌐 Language</span>
        <svg
          class="h-3 w-3 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div class="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
        <a
          href="/nl"
          class="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
          onClick={() => props.onNavigate?.()}
        >
          🇳🇱 Nederlands
        </a>
        <a
          href="/en"
          class="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
          onClick={() => props.onNavigate?.()}
        >
          🇬🇧 English
        </a>
      </div>
    </details>
  );
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = createSignal(false);
  const [loggingOut, setLoggingOut] = createSignal(false);

  const [me, { mutate: setMe }] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  async function onLogout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      setMe(null);
      window.location.href = "/";
    } finally {
      setLoggingOut(false);
    }
  }

  const links = (): NavLink[] => {
    const base: NavLink[] = [{ label: "Events", href: "/events" }];
    if (me()) {
      base.push({ label: "My events", href: "/events/mine" });
    }
    return base;
  };

  return (
    <nav class="border-b border-zinc-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <a href="/" class="flex items-center gap-3 no-underline">
          <span class="inline-flex">
            <img src="/apple-touch-icon.png" width={40} height={40} alt="Vegan Activists NL logo" />
          </span>
          <div>
            <p class="text-sm font-semibold leading-tight text-zinc-900">{SITE_TITLE}</p>
            <p class="text-xs text-zinc-600">{SITE_TAG}</p>
          </div>
        </a>

        <div class="hidden items-center gap-1 md:flex">
          <For each={links()}>
            {(link) => (
              <a href={link.href} class={linkClass}>
                {link.label}
              </a>
            )}
          </For>
          <Show
            when={!me.loading && me()}
            fallback={
              <Show when={!me.loading}>
                <a href="/login" class={linkClass}>
                  Login
                </a>
              </Show>
            }
          >
            <button
              type="button"
              disabled={loggingOut()}
              onClick={onLogout}
              class={`${linkClass} disabled:opacity-50`}
            >
              {loggingOut() ? "Logging out…" : "Logout"}
            </button>
          </Show>
          <LanguageSwitcher />
        </div>

        <button
          type="button"
          class="inline-flex items-center justify-center rounded-md p-2 text-zinc-700 hover:bg-zinc-100 md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen()}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <svg
            class="h-6 w-6"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <Show
              when={mobileOpen()}
              fallback={
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              }
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </Show>
          </svg>
        </button>
      </div>

      <Show when={mobileOpen()}>
        <div class="space-y-1 border-t border-zinc-200 px-6 py-3 md:hidden">
          <For each={links()}>
            {(link) => (
              <a href={link.href} class={linkClass} onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            )}
          </For>
          <Show
            when={!me.loading && me()}
            fallback={
              <Show when={!me.loading}>
                <a href="/login" class={linkClass} onClick={() => setMobileOpen(false)}>
                  Login
                </a>
              </Show>
            }
          >
            <button
              type="button"
              disabled={loggingOut()}
              onClick={onLogout}
              class={`${linkClass} w-full text-left disabled:opacity-50`}
            >
              {loggingOut() ? "Logging out…" : "Logout"}
            </button>
          </Show>
          <div class="px-3 py-2">
            <LanguageSwitcher onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      </Show>
    </nav>
  );
}
