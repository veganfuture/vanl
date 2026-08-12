import type { Metadata } from "next";
import { BASE_METADATA } from "@/lib/metadata";

export const metadata: Metadata = {
  ...BASE_METADATA,
  openGraph: {
    ...BASE_METADATA.openGraph,
    locale: "nl_NL",
  },
  alternates: {
    languages: {
      "en": "https://veganactivists.nl/en",
      "nl": "https://veganactivists.nl/nl",
    },
  },
};

export default function NlLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body>{children}</body></html>;
}
