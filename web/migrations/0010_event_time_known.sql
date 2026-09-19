-- Lets an event's start/end carry a known date with an unknown time (e.g.
-- ARC events that only specify a date - see import-arc-events.ts's use of
-- node-ical's `dateOnly` flag). Defaults to true so every existing row keeps
-- rendering exactly as it does today.
alter table events
  add column start_time_known boolean not null default true,
  add column end_time_known boolean not null default true;
