-- OT Committee Coordination System
-- 0011_dev_schema.sql : a `dev` schema for development / testing
--
-- WHY: local development, done-checks, and demo seeding all shared ONE database
-- with production, so every test write landed in the real committee record.
-- This creates a second schema, `dev`, holding the SAME table structure as
-- `public`. Which schema the app talks to is chosen by the DB_SCHEMA env var
-- (see lib/supabase/server.ts):
--
--   public = PRODUCTION. Real committee data. Never seed or test against it.
--   dev    = DEVELOPMENT. Throwaway. Seed and truncate freely.
--
-- No new Supabase project and no extra cost — one project, two schemas.
--
-- This file mirrors the cumulative structure of migrations 0001-0010 as it
-- stands in `public` (tables, columns, defaults, constraints, indexes, RLS).
-- It creates NO data; `supabase/seeds/dev_seed.sql` does the seeding.
--
-- Pure SQL (one do-block for a constraint), idempotent — safe to re-run.

create extension if not exists "pgcrypto";

create schema if not exists dev;

-- PostgREST reaches the schema as these roles; the app uses service_role.
grant usage on schema dev to anon, authenticated, service_role;
alter default privileges in schema dev
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema dev
  grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables (0001 + the columns added by 0003, 0004, 0008, 0009, 0010)
-- ---------------------------------------------------------------------------

create table if not exists dev.divisions (
  id                uuid primary key default gen_random_uuid(),
  number            integer not null,
  name              text    not null,
  vfp               text,
  color             text,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  head_exec_post_id uuid                                   -- FK added below (0003)
);

create table if not exists dev.departments (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references dev.divisions(id) on delete cascade,
  number       integer not null,
  name         text    not null,
  vfp          text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  head_post_id uuid                                        -- FK added below (0008)
);

create table if not exists dev.sections (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references dev.departments(id) on delete cascade,
  name           text    not null,
  vfp            text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- department_id is NULLABLE (0008): division-head posts belong to no department.
create table if not exists dev.posts (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid references dev.departments(id) on delete cascade,
  section_id     uuid references dev.sections(id) on delete set null,
  title          text    not null,
  purpose        text,
  product        text,
  senior_post_id uuid references dev.posts(id) on delete set null,
  is_vacant      boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  division_id    uuid references dev.divisions(id) on delete cascade
);

-- name is nullable (0004: email-only members); role/status added by 0004.
create table if not exists dev.members (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid,
  name        text,
  email       text,
  contact     text,
  created_at  timestamptz not null default now(),
  role        text not null default 'member',
  status      text not null default 'invited'
);

create table if not exists dev.post_holders (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references dev.posts(id) on delete cascade,
  member_id    uuid references dev.members(id) on delete set null,
  holder_name  text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists dev.board_meta (
  id         uuid primary key default gen_random_uuid(),
  vfp        text,
  updated_at timestamptz not null default now()
);

create table if not exists dev.stats (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references dev.posts(id) on delete cascade,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  rollup      text not null default 'sum'
);

create table if not exists dev.stat_entries (
  id           uuid primary key default gen_random_uuid(),
  stat_id      uuid not null references dev.stats(id) on delete cascade,
  member_id    uuid not null references dev.members(id) on delete cascade,
  week_ending  date not null,
  value        numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references dev.members(id) on delete set null,
  constraint stat_entries_unique unique (stat_id, member_id, week_ending)
);

create table if not exists dev.member_hours (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references dev.members(id) on delete cascade,
  week_ending  date not null,
  hours        numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references dev.members(id) on delete set null,
  constraint member_hours_unique unique (member_id, week_ending)
);

create table if not exists dev.settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- subject_id intentionally NOT an FK — points at stats.id or members.id (0009).
create table if not exists dev.stat_notes (
  id             uuid primary key default gen_random_uuid(),
  subject_type   text not null check (subject_type in ('stat', 'hours')),
  subject_id     uuid not null,
  note_date      date not null,
  body           text not null,
  show_on_graph  boolean not null default false,
  created_by     uuid references dev.members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Circular / late foreign keys and check constraints
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dev_divisions_head_exec_fk') then
    alter table dev.divisions add constraint dev_divisions_head_exec_fk
      foreign key (head_exec_post_id) references dev.posts(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'dev_departments_head_post_fk') then
    alter table dev.departments add constraint dev_departments_head_post_fk
      foreign key (head_post_id) references dev.posts(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'dev_members_role_chk') then
    alter table dev.members add constraint dev_members_role_chk
      check (role in ('admin', 'member'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'dev_members_status_chk') then
    alter table dev.members add constraint dev_members_status_chk
      check (status in ('invited', 'active'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'dev_stats_rollup_check') then
    alter table dev.stats add constraint dev_stats_rollup_check
      check (rollup in ('sum', 'average', 'last'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes (mirrors public)
-- ---------------------------------------------------------------------------

create index if not exists departments_division_idx    on dev.departments(division_id);
create index if not exists departments_head_post_idx    on dev.departments(head_post_id);
create index if not exists sections_department_idx      on dev.sections(department_id);
create index if not exists posts_department_idx         on dev.posts(department_id);
create index if not exists posts_section_idx            on dev.posts(section_id);
create index if not exists posts_division_idx           on dev.posts(division_id);
create index if not exists post_holders_post_idx        on dev.post_holders(post_id);
create index if not exists divisions_head_exec_idx      on dev.divisions(head_exec_post_id);
create unique index if not exists members_email_unique  on dev.members (lower(email));
create index if not exists stats_post_idx               on dev.stats(post_id);
create index if not exists stat_entries_member_week_idx on dev.stat_entries(member_id, week_ending);
create index if not exists stat_notes_subject_idx       on dev.stat_notes(subject_type, subject_id, note_date desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security — same posture as public: RLS on every table, one policy
-- granting the authenticated role full access. All app access is server-side
-- with the service-role key (which bypasses RLS).
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'divisions','departments','sections','posts','members','post_holders',
    'board_meta','stats','stat_entries','member_hours','settings','stat_notes'
  ] loop
    execute format('alter table dev.%I enable row level security', t);
    execute format('drop policy if exists %I on dev.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on dev.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t);
  end loop;
end $$;

grant all on all tables in schema dev to anon, authenticated, service_role;
grant all on all sequences in schema dev to anon, authenticated, service_role;

-- ---- Verify -------------------------------------------------------------------
select
  (select count(*) from information_schema.tables where table_schema = 'dev')  as dev_tables,
  (select count(*) from pg_tables where schemaname = 'dev' and rowsecurity)    as dev_rls_on;
