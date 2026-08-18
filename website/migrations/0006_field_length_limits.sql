-- Bounds every free-text field that had no length limit at all (only
-- organizations.name was ever capped, at 120, in the app layer). These are
-- CHECK constraints rather than just app-layer zod .max() calls because
-- scripts/import-arc-events.ts writes via EventRepository directly,
-- bypassing EventInputSchema/validateEvent entirely - only a DB-level
-- constraint actually covers that path. char_length(null) is null, and
-- `null <= n` is null (which CHECK treats as passing), so these are safe on
-- the existing nullable columns with no extra "or ... is null" needed.

alter table events add constraint events_title_nl_length check (char_length(title_nl) <= 200);
alter table events add constraint events_title_en_length check (char_length(title_en) <= 200);
alter table events add constraint events_description_nl_length
  check (char_length(description_nl) <= 10000);
alter table events add constraint events_description_en_length
  check (char_length(description_en) <= 10000);
alter table events add constraint events_location_description_length
  check (char_length(location_description) <= 500);
alter table events add constraint events_map_url_length check (char_length(map_url) <= 2000);
alter table events add constraint events_external_event_url_length
  check (char_length(external_event_url) <= 2000);
alter table events add constraint events_registration_url_length
  check (char_length(registration_url) <= 2000);

alter table organizations add constraint organizations_description_length
  check (char_length(description) <= 10000);
alter table organizations add constraint organizations_website_url_length
  check (char_length(website_url) <= 2000);
