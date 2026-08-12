import { Metadata } from "next";

export const BASE_URL = "https://veganactivists.nl";

export function withBaseUrl(path: string): string {
  return `${BASE_URL}${path}`
}

const METADATA_DESCRIPTION = "The #1 vegan activists group in the Netherlands ✊"

export const BASE_METADATA: Metadata = {
  metadataBase: new URL(BASE_URL),
  manifest: "/site.webmanifest",
  title: "Vegan Activists NL",
  description: METADATA_DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    other: [
      {
        rel: "manifest",
        url: "/site.webmanifest",
      },
    ],
  },
  openGraph: {
    title: "Vegan Activists NL",
    description: METADATA_DESCRIPTION,
    url: BASE_URL,
    siteName: "Vegan Activists NL",
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 1200,
        height: 630,
        alt: "Vegan Activists NL logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vegan Activists NL",
    description: METADATA_DESCRIPTION,
    images: ["/web-app-manifest-512x512.png"],
  },
};

export const SIGNAL_GROUP_URL =
"https://signal.group/#CjQKIDB9f2aSHUHI7fh0Qw17Us9eCzT4zOC4rtgUo9EBuosxEhAX5OtDPGYorCmmE4rQ3AfU" as const;