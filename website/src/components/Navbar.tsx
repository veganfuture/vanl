import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";

type NavLink = { label: string; href: string };

const linkClass =
  "block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";

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
    const base: NavLink[] = [
      { label: "Home", href: "/" },
      { label: "Events", href: "/events" },
    ];
    if (me()) {
      base.push({ label: "My events", href: "/events/mine" });
    }
    return base;
  };

  return (
    <nav class="border-b border-zinc-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <a href="/" class="text-sm font-semibold text-zinc-900 no-underline">
          Vegan Activists NL
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
        </div>
      </Show>
    </nav>
  );
}
