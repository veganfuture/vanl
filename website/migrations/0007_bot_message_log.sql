-- General log of every message the website has asked the bot to send, keyed
-- by recipient rather than by feature (login_challenges' own per-account/
-- per-IP counters are specific to the OTP flow). Backs a loose, message-
-- type-agnostic backstop cap on how many messages one Signal person can be
-- sent in a window - see src/domain/bot/bot_send_limit.ts - so any future
-- message type (docs/architecture.md also anticipates signup confirmations)
-- inherits spam protection without having to reimplement its own counter.

create table bot_messages_sent (
  id uuid primary key default gen_random_uuid(),
  recipient_aci text not null,
  message_type text not null,
  created_at timestamptz not null default now()
);

create index bot_messages_sent_recipient_created_idx on bot_messages_sent (recipient_aci, created_at);
