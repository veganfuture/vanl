import type { Metadata } from "next";
import { BASE_METADATA } from "@/lib/metadata";

export const metadata: Metadata = {
  ...BASE_METADATA,
  openGraph: {
    ...BASE_METADATA.openGraph,
    locale: "en_US",
  },
  alternates: {
    languages: {
      "en": "https://veganactivists.nl/en",
      "nl": "https://veganactivists.nl/nl",
    },
  },
};

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
