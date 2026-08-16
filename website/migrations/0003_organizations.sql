-- Organizations (Milestone 5). See docs/architecture.md §Organization/OrganizationMembership.
-- Extends events (0002) with publisher_org_id - a forward ALTER, exactly as
-- 0002's own header comment anticipated ("publisher_org_id and the
-- exactly-one-publisher CHECK... arrive in later milestones (M5/M6) via
-- forward ALTERs, not here").

create type organization_status as enum ('active', 'deleted');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  slug text not null unique,
  description text,
  website_url text,
  -- logo_image_id intentionally omitted - arrives in M6 alongside Image,
  -- same reasoning as events' own flyer columns not existing yet either.
  status organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type organization_role as enum ('org_editor', 'org_admin');

-- Invariant enforced in the application layer within a transaction (not
-- expressible as a plain CHECK): every organization has >=1 org_admin at
-- all times. See OrganizationRepository's updateMembershipRoleUnlessSoleAdmin
-- / removeMembershipUnlessSoleAdmin.
create table organization_memberships (
  org_id uuid not null references organizations (id),
  user_id uuid not null references users (id),
  role organization_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index organization_memberships_user_id_idx on organization_memberships (user_id);

-- An event is published by exactly one of a user or an org.
alter table events alter column publisher_user_id drop not null;
alter table events add column publisher_org_id uuid references organizations (id);
alter table events add constraint events_exactly_one_publisher
  check ((publisher_user_id is not null) <> (publisher_org_id is not null));

create index events_publisher_org_id_idx on events (publisher_org_id);
