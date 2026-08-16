import { detectSignalPlatform, type SignalPlatform } from "~/lib/signal-platform";
import type { Locale } from "~/lib/i18n";

/** signal.org/install is the mobile app-store-redirect page; desktop OSes get real installers from signal.org/download instead. */
const MOBILE_PLATFORMS = new Set<SignalPlatform>(["android", "ios"]);

const PLATFORM_LABELS: Record<Exclude<SignalPlatform, null>, string> = {
  android: "Android",
  ios: "iPhone",
  windows: "Windows",
  mac: "Mac",
  linux: "Linux",
};

/** "(No Signal yet? Install Signal for Android)" / "...Download Signal on Mac)" - OS-aware so the link actually lands on the right page. */
export function SignalLink(props: { lang: Locale }) {
  const platform = detectSignalPlatform();
  const isMobile = platform !== null && MOBILE_PLATFORMS.has(platform);
  const href = isMobile ? "https://signal.org/install/" : "https://signal.org/download/";
  const platformLabel = platform ? PLATFORM_LABELS[platform] : null;

  const label = () => {
    const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);
    const action = isMobile
      ? t("Installeer Signal", "Install Signal")
      : t("Download Signal", "Download Signal");
    if (!platformLabel) {
      return action;
    }
    const preposition = isMobile ? t("voor", "for") : t("op", "on");
    return `${action} ${preposition} ${platformLabel}`;
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      class="text-sm text-zinc-600 underline"
    >
      {label()}
    </a>
  );
}
