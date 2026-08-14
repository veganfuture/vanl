-- Auth tables only (Milestone 2 scope). See docs/architecture.md §2 for the
-- full target domain model — events/organizations arrive in later milestones.

create extension if not exists citext;

create table users (
  id uuid primary key default gen_random_uuid(),
  signal_aci uuid not null unique,
  account_name citext not null unique,
  email text not null,
  display_name text not null,
  affiliations_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type global_role as enum ('site_admin');

create table global_roles (
  user_id uuid not null references users (id),
  role global_role not null,
  primary key (user_id, role)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_user_id_idx on sessions (user_id);

create table login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  code_hash text not null,
  attempts_remaining int not null default 3,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index login_challenges_user_id_idx on login_challenges (user_id);

-- No row exists until a signup token is actually consumed (the bot signs
-- tokens statelessly, it never registers a nonce anywhere). Existence alone
-- means "used"; used_at just records when.
create table signup_nonces (
  nonce text primary key,
  used_at timestamptz not null default now()
);
