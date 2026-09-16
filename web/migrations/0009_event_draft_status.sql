-- Adds a draft status: publishers can save an event without making it public
-- yet. Once an event leaves draft (via publish or moderation), it can never
-- go back - enforced in event_service.ts, not the database, since Postgres
-- enums can't express state-transition rules.
alter type event_status add value 'draft';
