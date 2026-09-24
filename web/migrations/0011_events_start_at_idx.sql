-- findEventByTitleAndStart (import-arc-events.ts's duplicate check, run once
-- per never-before-seen ARC event on every hourly import) looks up by
-- start_at alone - the existing events_status_start_at_idx can't serve that
-- (status is its leading column), so without this it's a full table scan.
create index events_start_at_idx on events (start_at);
