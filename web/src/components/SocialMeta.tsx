import { Link, Meta, Title } from "@solidjs/meta";
import { SITE_TITLE } from "~/lib/metadata";

/**
 * Full Open Graph / Twitter Card tag set for a single event or organization
 * page, so links shared on WhatsApp/Facebook/etc. show that specific
 * event's/org's own title, description, and image instead of the generic
 * site-wide card. `image` and `url` must already be absolute - callers are
 * responsible for `withBaseUrl()`/fallback-to-site-default logic, since
 * that varies by which image field each domain model has.
 */
export function SocialMeta(props: {
  name: string;
  description: string;
  image: string;
  url: string;
  locale: string;
}) {
  const pageTitle = () => `${props.name} — ${SITE_TITLE}`;

  return (
    <>
      <Title>{pageTitle()}</Title>
      <Meta property="og:title" content={pageTitle()} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:image" content={props.image} />
      <Meta property="og:image:alt" content={props.name} />
      <Meta property="og:url" content={props.url} />
      <Meta property="og:locale" content={props.locale} />
      <Meta name="twitter:card" content="summary_large_image" />
      <Meta name="twitter:title" content={props.name} />
      <Meta name="twitter:description" content={props.description} />
      <Meta name="twitter:image" content={props.image} />
      <Link rel="canonical" href={props.url} />
    </>
  );
}
