-- Events core (Milestone 3 scope). See docs/architecture.md §Event/Place/Province.
-- Individual publishing only at this stage: publisher_org_id and the
-- exactly-one-publisher CHECK, plus flyer image columns, arrive in later
-- milestones (M5/M6) via forward ALTERs, not here.

create type province as enum (
  'Drenthe', 'Flevoland', 'Fryslân', 'Gelderland', 'Groningen', 'Limburg',
  'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland'
);

-- Canonical woonplaats, seeded once from pdok.nl (see scripts/seed-places.ts),
-- not user-editable. ADR-3 in docs/milestones.md.
create table places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  municipality_name text not null,
  province province not null,
  source_id text not null unique
);

create index places_name_idx on places (name);

create type event_location_kind as enum (
  'precise_address', 'city_only', 'meeting_point_city_only', 'location_tbd'
);

create type event_status as enum ('hidden', 'visible', 'cancelled');

create type event_source as enum ('manual', 'signal_import', 'partner_import');

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,

  title text not null,
  description text not null,

  start_at timestamptz not null,
  end_at timestamptz,
  constraint events_end_after_start check (end_at is null or end_at > start_at),

  location_kind event_location_kind not null,
  place_id uuid not null references places (id),
  location_description text not null,

  -- Best-effort PDOK Locatieserver lookup result for location_kind =
  -- precise_address; null if the publisher's event isn't precise_address, or
  -- if it is but PDOK was unreachable when they saved (never a hard
  -- requirement to publish - see docs/milestones.md M3).
  location_street text,
  location_house_number text,
  location_postcode text,
  location_lat double precision,
  location_lng double precision,
  location_pdok_id text,
  constraint events_pdok_fields_only_for_precise_address check (
    location_kind = 'precise_address'
    or (
      location_street is null and location_house_number is null and location_postcode is null
      and location_lat is null and location_lng is null and location_pdok_id is null
    )
  ),

  map_url text,
  contact_info text,
  registration_instructions text,
  external_event_url text,
  registration_url text,

  publisher_user_id uuid not null references users (id),
  publisher_user_visible boolean not null default true,

  status event_status not null default 'visible',
  cancel_reason text,
  constraint events_cancel_reason_only_when_cancelled check (
    status = 'cancelled' or cancel_reason is null
  ),

  is_featured boolean not null default false,

  source event_source not null default 'manual',
  external_source_id text,
  recurrence_rule jsonb,

  created_by uuid not null references users (id),
  updated_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_place_id_idx on events (place_id);
create index events_publisher_user_id_idx on events (publisher_user_id);
create index events_status_start_at_idx on events (status, start_at);
