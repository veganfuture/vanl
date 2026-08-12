// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { BASE_METADATA } from "@/lib/metadata";

export const metadata: Metadata = BASE_METADATA;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"> {/* see per-locale overrides below */}
      <body>{children}</body>
    </html>
  );
}
