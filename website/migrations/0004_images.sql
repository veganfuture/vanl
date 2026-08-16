-- Images (Milestone 6). See docs/architecture.md §Image.
-- Kept in its own table so ordinary event/org listing queries never fetch
-- image bytes. Content-addressed (sha256 of the final re-encoded webp
-- bytes) and therefore genuinely immutable - served at /images/{sha256}.webp
-- with a long-lived Cache-Control.

create table images (
  sha256 text primary key,
  bytes bytea not null,
  mime text not null,
  width int not null,
  height int not null,
  created_at timestamptz not null default now()
);

-- Forward ALTERs anticipated by 0002_events.sql's and 0003_organizations.sql's
-- own header comments - see image_processing.ts for the actual variant
-- widths. An event gets three variants (full, preview, thumbnail); an org
-- logo gets two (full, thumbnail) - its "full" is already thumbnail-sized
-- enough at 400px that a third, even-smaller variant isn't worth it, but
-- flyers start much larger (1600px) so need a dedicated small variant for
-- list-view thumbnails rather than shipping a 600px preview image just to
-- crop it down in the browser. Both thumbnail variants target the same
-- pixel width, so an event's own flyer thumbnail and its organizer's logo
-- thumbnail (the fallback when the event has none) look consistent
-- side-by-side in a list.
alter table events add column flyer_full_image_id text references images (sha256);
alter table events add column flyer_preview_image_id text references images (sha256);
alter table events add column flyer_thumbnail_image_id text references images (sha256);

alter table organizations add column logo_full_image_id text references images (sha256);
alter table organizations add column logo_thumbnail_image_id text references images (sha256);
