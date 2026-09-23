import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense } from "solid-js";
import { ErrorFallback } from "~/components/ErrorFallback";
import { Footer } from "~/components/Footer";
import { Navbar } from "~/components/Navbar";
import { SITE_DESCRIPTION, SITE_TITLE } from "~/lib/metadata";
import "./app.css";

export default function App() {
  return (
    <MetaProvider>
      <Title>{SITE_TITLE}</Title>
      <Meta name="description" content={SITE_DESCRIPTION} />
      {/* og:title/description/image and twitter:* are deliberately NOT
          defaulted here - unlike <Title>, <Meta> isn't deduped as a true
          HTML singleton, so a page-level override would render ALONGSIDE
          this default instead of replacing it (confirmed by curling actual
          event/org pages: both tags appeared, which is exactly wrong for
          crawlers). Each page that wants an OG/Twitter card sets its own
          complete set instead; other pages fall back to <title>/description,
          which crawlers already understand. */}
      <Meta property="og:type" content="website" />
      <Meta property="og:site_name" content={SITE_TITLE} />
      <Link rel="manifest" href="/site.webmanifest" />
      <Router
        root={(props) => (
          <ErrorBoundary fallback={(err, reset) => <ErrorFallback error={err} reset={reset} />}>
            <Suspense>
              <Navbar />
            </Suspense>
            <Suspense>{props.children}</Suspense>
            <Suspense>
              <Footer />
            </Suspense>
          </ErrorBoundary>
        )}
      >
        <FileRoutes />
      </Router>
    </MetaProvider>
  );
}
