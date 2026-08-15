import { Link, Meta, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense } from "solid-js";
import { ErrorFallback } from "~/components/ErrorFallback";
import { Navbar } from "~/components/Navbar";
import "./app.css";

const SITE_DESCRIPTION = "The #1 vegan activists group in the Netherlands ✊";

export default function App() {
  return (
    <MetaProvider>
      <Title>Vegan Activists NL</Title>
      <Meta name="description" content={SITE_DESCRIPTION} />
      <Link rel="manifest" href="/site.webmanifest" />
      <Router
        root={(props) => (
          <ErrorBoundary fallback={(err, reset) => <ErrorFallback error={err} reset={reset} />}>
            <Suspense>
              <Navbar />
            </Suspense>
            <Suspense>{props.children}</Suspense>
          </ErrorBoundary>
        )}
      >
        <FileRoutes />
      </Router>
    </MetaProvider>
  );
}
