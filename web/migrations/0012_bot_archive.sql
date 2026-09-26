-- Signal event-ingestion bot's own message archive and notification
-- bookkeeping. Deliberately separate from every other table: vanl_bot
-- (below) is granted access only here, so the bot holding a real DB
-- credential still can't touch events/users/etc. directly - it only ever
-- writes there through the public HTTP API as the signal-bot web
-- account (see auth_service.ts's getBotUser). Table names follow the
-- bot_messages_sent convention (0007_bot_message_log.sql).
--
-- Living in the same Postgres database as everything else (not a bot-local
-- SQLite file) is deliberate: a single `pg_dump` of this database now
-- captures the entire state of both the website and the bot's Signal
-- archive, rather than needing a second backup story.

create table bot_archived_messages (
  id uuid primary key default gen_random_uuid(),
  -- Signal message identity is (sender aci, timestamp) by protocol design -
  -- collapsed into one opaque string here (see bot/src/bot/message_archive.py)
  -- so MCP tool arguments can reference a message by a single id.
  message_id text not null unique,
  group_id text not null,
  group_name text not null,
  sender_aci text not null,
  sender_name text,
  message_text text,
  -- Full parsed envelope, not just the fields captured above - lets a future
  -- feature use something we didn't anticipate at design time without
  -- re-architecting capture or losing already-archived history.
  raw_envelope jsonb not null,
  received_at timestamptz not null default now(),
  -- Written by the MCP server's write-tool handlers as part of the same
  -- call that performs the external action (create/update the web event,
  -- or mark reviewed-and-ignored) - not by the periodic feature after the
  -- fact. See the Signal ingestion plan: "processed" is only true once a
  -- write has actually committed.
  processed_at timestamptz,
  attempts integer not null default 0,
  -- Null when reviewed and correctly judged not to be an event.
  matched_event_id uuid
);

-- The periodic review pass's main query: unprocessed messages at least
-- message_action_delay_seconds old (the 10-minute self-correction buffer).
create index bot_archived_messages_unprocessed_idx
  on bot_archived_messages (received_at)
  where processed_at is null;

create index bot_archived_messages_group_received_idx
  on bot_archived_messages (group_id, received_at);

create table bot_archived_attachments (
  attachment_id text primary key,
  message_id uuid not null references bot_archived_messages (id) on delete cascade,
  content_type text,
  -- Stored here, not just left on the bot's local disk, so the same
  -- Postgres backup that covers everything else also covers flyer images -
  -- otherwise "one backup for both website and bot" would quietly be false
  -- for exactly the attachments a flyer-only event post depends on.
  bytes bytea not null,
  downloaded_at timestamptz not null default now()
);

-- One row per web event the bot has notified admins about, holding only
-- what was last sent - the dedup check compares against this before
-- posting again, so an unchanged event is never re-announced. No FK to
-- events(id): this is the bot's own local record of what it already said,
-- kept even if the web event is later deleted.
create table bot_event_notifications (
  event_id uuid primary key,
  last_summary_text text not null,
  last_notified_at timestamptz not null default now()
);

-- A distinct, narrowly-scoped Postgres role for the bot's direct DB access,
-- separate from the `vanl` role the website connects as. Granted only on
-- the three tables above - see the file-level comment for why that
-- boundary matters. No password is set here (a committed SQL file can't
-- hold a secret) - set one out-of-band per environment, e.g.
-- `alter role vanl_bot with password '...'` via `vanl db repl`, matching
-- VANL_BOT_DATABASE_PASSWORD (see bot/README.md). Requires the
-- migration-running role to have CREATEROLE - true for the dev/test
-- `initdb`-created superuser; verify for the production `vanl` role before
-- this migration runs there. If it doesn't, create the role once
-- out-of-band as an actual superuser first and this block becomes a no-op.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vanl_bot') then
    create role vanl_bot login;
  end if;
end
$$;

grant select, insert, update on bot_archived_messages, bot_archived_attachments, bot_event_notifications
  to vanl_bot;
