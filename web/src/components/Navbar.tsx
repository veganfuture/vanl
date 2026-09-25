import { useLocation } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { AccountIcon, ChevronDownIcon, HamburgerIcon } from "~/components/icons";
import { apiFetch } from "~/lib/api-fetch";
import { useLang, type Locale } from "~/lib/i18n";
import { useMe } from "~/lib/queries";

type NavLink = { label: string; href: string };

const linkClass =
  "block shrink-0 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800";

const loginLinkClass =
  "block shrink-0 whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 no-underline";

const donateLinkClass =
  "block shrink-0 whitespace-nowrap rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 no-underline";

const LANGUAGE_META: Record<Locale, { flag: string; label: string }> = {
  nl: { flag: "🇳🇱", label: "Nederlands" },
  en: { flag: "🇬🇧", label: "English" },
};

/** Swaps the leading /nl or /en segment of a path, or falls back to the bare locale root. */
function pathWithLang(pathname: string, targetLang: Locale): string {
  const match = pathname.match(/^\/(en|nl)(\/.*)?$/);
  return match ? `/${targetLang}${match[2] ?? ""}` : `/${targetLang}`;
}

function LanguageSwitcher(props: { lang: Locale; pathname: string; onNavigate?: () => void }) {
  // `open` is mirrored from the native <details> via onToggle rather than
  // left uncontrolled - a locale switch is a client-side route change, so
  // this component stays mounted across it, and an uncontrolled <details>
  // would stay open instead of closing once a language is picked.
  const [open, setOpen] = createSignal(false);

  return (
    <details
      class="relative group shrink-0"
      open={open()}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary class="list-none flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-2.5 py-1.5 text-sm shadow-sm hover:border-emerald-400">
        <span>{LANGUAGE_META[props.lang].flag}</span>
        <span>{LANGUAGE_META[props.lang].label}</span>
        <ChevronDownIcon class="h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div class="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
        <For each={["nl", "en"] as Locale[]}>
          {(code) => (
            <a
              href={pathWithLang(props.pathname, code)}
              class="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-emerald-50"
              onClick={() => {
                setOpen(false);
                props.onNavigate?.();
              }}
            >
              {LANGUAGE_META[code].flag} {LANGUAGE_META[code].label}
            </a>
          )}
        </For>
      </div>
    </details>
  );
}

/** Desktop account dropdown - My events / My organizations / Account / Sign out. */
function AccountMenu(props: {
  lang: Locale;
  displayName: string;
  accountLinks: NavLink[];
  loggingOut: boolean;
  onLogout: () => void;
}) {
  // Same controlled-open pattern as LanguageSwitcher, for the same reason:
  // an uncontrolled <details> would stay open after a client-side route
  // change to one of the account links below.
  const [open, setOpen] = createSignal(false);

  return (
    <details
      class="relative group shrink-0"
      open={open()}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary class="list-none flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-2.5 py-1.5 text-sm shadow-sm hover:border-emerald-400">
        <AccountIcon class="h-4 w-4 shrink-0 text-zinc-500" />
        <span class="max-w-[8rem] truncate">{props.displayName}</span>
        <ChevronDownIcon class="h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div class="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
        <For each={props.accountLinks}>
          {(link) => (
            <a
              href={link.href}
              class="block px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-emerald-50"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          )}
        </For>
        <button
          type="button"
          disabled={props.loggingOut}
          onClick={() => {
            setOpen(false);
            props.onLogout();
          }}
          class="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-emerald-50 disabled:opacity-50"
        >
          {props.loggingOut
            ? props.lang === "nl"
              ? "Bezig met uitloggen…"
              : "Logging out…"
            : props.lang === "nl"
              ? "Uitloggen"
              : "Sign out"}
        </button>
      </div>
    </details>
  );
}

/** Mobile nested collapsible - same items as AccountMenu, opened inside the hamburger sheet. */
function MobileAccountMenu(props: {
  lang: Locale;
  t: (nl: string, en: string) => string;
  accountLinks: NavLink[];
  loggingOut: boolean;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = createSignal(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open()}
        aria-controls="mobile-account-menu-panel"
        onClick={() => setOpen((current) => !current)}
        class={`${linkClass} flex w-full items-center justify-between`}
      >
        <span class="flex items-center gap-1.5">
          <AccountIcon class="h-4 w-4 shrink-0 text-zinc-500" />
          {props.t("Account", "Account")}
        </span>
        <ChevronDownIcon
          class={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${open() ? "rotate-180" : "rotate-0"}`}
        />
      </button>
      <Show when={open()}>
        <div id="mobile-account-menu-panel" class="space-y-1 py-1 pl-4">
          <For each={props.accountLinks}>
            {(link) => (
              <a
                href={link.href}
                class={linkClass}
                onClick={() => {
                  setOpen(false);
                  props.onNavigate();
                }}
              >
                {link.label}
              </a>
            )}
          </For>
          <button
            type="button"
            disabled={props.loggingOut}
            onClick={() => props.onLogout()}
            class={`${linkClass} w-full text-left disabled:opacity-50`}
          >
            {props.loggingOut
              ? props.t("Bezig met uitloggen…", "Logging out…")
              : props.t("Uitloggen", "Sign out")}
          </button>
        </div>
      </Show>
    </div>
  );
}

export function Navbar() {
  const location = useLocation();
  const { lang, t } = useLang();

  const [mobileOpen, setMobileOpen] = createSignal(false);
  const [loggingOut, setLoggingOut] = createSignal(false);

  // On mobile the navbar is sticky (see the JSX below), so it's on screen
  // for as long as the user is browsing a page - shrinking it once they
  // start scrolling keeps it from permanently eating a large chunk of a
  // small screen. Desktop's `nav:relative` nav isn't sticky, so this has no
  // visible effect there. events/index.tsx's filter bar mirrors this same
  // 56px shrunk height to stay flush against it once scrolled.
  const [scrolled, setScrolled] = createSignal(false);

  onMount(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  const me = useMe();

  async function onLogout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      // A hard navigation, not a client-side route change - the fresh
      // SSR render picks up the now-cleared session cookie on its own, no
      // local state update needed.
      window.location.href = `/${lang()}`;
    } finally {
      setLoggingOut(false);
    }
  }

  const links = (): NavLink[] => {
    const base: NavLink[] = [
      { label: t("Evenementen", "Events"), href: `/${lang()}/events` },
      { label: t("Organisaties", "Organizations"), href: `/${lang()}/organizations` },
    ];
    if (me()?.isSiteAdmin) {
      base.push({ label: t("Gebruikers", "Users"), href: `/${lang()}/admin/users` });
      // /status itself is public (see its own file comment) - only the nav
      // link is admin-only, to keep it out of the way for ordinary visitors.
      base.push({ label: t("Status", "Status"), href: "/status" });
    }
    return base;
  };

  const accountLinks = (): NavLink[] => [
    { label: t("Mijn evenementen", "My events"), href: `/${lang()}/events/mine` },
    { label: t("Mijn organisaties", "My organizations"), href: `/${lang()}/organizations/mine` },
    { label: t("Account", "Account"), href: `/${lang()}/account` },
  ];

  return (
    <nav class="sticky top-0 z-50 border-b border-zinc-200 bg-white/85 shadow-sm backdrop-blur-md nav:relative">
      <div
        class={`mx-auto flex max-w-6xl items-center justify-between px-6 transition-[padding] duration-200 nav:py-3 ${
          scrolled() ? "py-1" : "py-3"
        }`}
      >
        <a href={`/${lang()}`} class="flex shrink-0 items-center gap-2 no-underline">
          <span class="inline-flex">
            <img
              src="/apple-touch-icon.png"
              width={60}
              height={60}
              alt="Vegan Activists NL logo"
              class={`shrink-0 transition-all duration-200 nav:h-[60px] nav:w-[60px] ${
                scrolled() ? "h-8 w-8" : "h-[60px] w-[60px]"
              }`}
            />
          </span>
          <div>
            <p class="my-1 whitespace-nowrap py-0 text-sm font-semibold leading-tight text-zinc-900">
              VeganActivists.nl
            </p>
            {/* Decorative only, so it's held back to a wider breakpoint than
                the nav/mobile switch itself - it's the longest piece of text
                in the bar (especially in Dutch), and letting it in at the
                same breakpoint as the nav links is what previously caused
                the logo block to wrap/squash right as the desktop layout
                kicked in. */}
            <p class="my-1 hidden whitespace-nowrap py-0 text-xs text-zinc-600 lg:block">
              {t(
                "Samen sterk voor dierenrechten • Nederland",
                "Together united for animal rights • Netherlands",
              )}
            </p>
          </div>
        </a>

        <div class="hidden items-center gap-1 nav:flex">
          <For each={links()}>
            {(link) => (
              <a href={link.href} class={linkClass}>
                {link.label}
              </a>
            )}
          </For>
          <a href={`/${lang()}/donate`} class={donateLinkClass}>
            ❤️ {t("Doneer", "Donate")}
          </a>
          <Show
            when={me() !== undefined && me()}
            fallback={
              <Show when={me() !== undefined}>
                <a href={`/${lang()}/login`} class={loginLinkClass}>
                  {t("Inloggen", "Log in")}
                </a>
              </Show>
            }
          >
            {(currentMe) => (
              <AccountMenu
                lang={lang()}
                displayName={currentMe().displayName}
                accountLinks={accountLinks()}
                loggingOut={loggingOut()}
                onLogout={onLogout}
              />
            )}
          </Show>
          <LanguageSwitcher lang={lang()} pathname={location.pathname} />
        </div>

        <button
          type="button"
          class={`inline-flex items-center justify-center rounded-md text-zinc-700 transition-[padding] duration-200 hover:bg-zinc-100 nav:hidden nav:p-2 ${
            scrolled() ? "p-1" : "p-2"
          }`}
          aria-label={t("Menu omschakelen", "Toggle menu")}
          aria-expanded={mobileOpen()}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <HamburgerIcon class="h-6 w-6" open={mobileOpen()} />
        </button>
      </div>

      <Show when={mobileOpen()}>
        <div class="space-y-1 border-t border-zinc-200 px-6 py-3 nav:hidden">
          <For each={links()}>
            {(link) => (
              <a href={link.href} class={linkClass} onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            )}
          </For>
          <a
            href={`/${lang()}/donate`}
            class={`${donateLinkClass} text-center`}
            onClick={() => setMobileOpen(false)}
          >
            ❤️ {t("Doneer", "Donate")}
          </a>
          <Show
            when={me() !== undefined && me()}
            fallback={
              <Show when={me() !== undefined}>
                <a
                  href={`/${lang()}/login`}
                  class={`${loginLinkClass} text-center`}
                  onClick={() => setMobileOpen(false)}
                >
                  {t("Inloggen", "Log in")}
                </a>
              </Show>
            }
          >
            <MobileAccountMenu
              lang={lang()}
              t={t}
              accountLinks={accountLinks()}
              loggingOut={loggingOut()}
              onNavigate={() => setMobileOpen(false)}
              onLogout={onLogout}
            />
          </Show>
          <div class="px-3 py-2">
            <LanguageSwitcher
              lang={lang()}
              pathname={location.pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      </Show>
    </nav>
  );
}
