-- OT Committee Coordination System — Slice 1a
-- 0001_init_schema.sql : tables + row-level security
--
-- Run this FIRST in the Supabase SQL editor (project: ot-committee).
-- This file is NOT applied automatically. Nothing exists in the database until you run it.
-- Pure SQL only (no PL/pgSQL blocks) and idempotent — safe to re-run.

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- 7 divisions of the org board
create table if not exists public.divisions (
  id          uuid primary key default gen_random_uuid(),
  number      integer not null,                 -- division number (1..7)
  name        text    not null,
  vfp         text,                              -- Valuable Final Product
  color       text,                              -- division color-flash (hex, e.g. #F2A0B0)
  sort_order  integer not null default 0,        -- left-to-right board order
  created_at  timestamptz not null default now()
);

-- departments belong to a division
create table if not exists public.departments (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references public.divisions(id) on delete cascade,
  number       integer not null,                 -- department number (1..21)
  name         text    not null,
  vfp          text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- optional sections inside a department
create table if not exists public.sections (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  name           text    not null,
  vfp            text,                            -- nullable
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- posts hang off a department, and optionally a section
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  section_id     uuid references public.sections(id) on delete set null,
  title          text    not null,
  purpose        text,
  product        text,
  senior_post_id uuid references public.posts(id) on delete set null,
  is_vacant      boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- members = logged-in people (auth arrives in slice 1b)
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid,                               -- links to auth.users later
  name        text not null,
  email       text,
  contact     text,
  created_at  timestamptz not null default now()
);

-- post_holders links a post to EITHER a member OR a plain name.
-- Many-to-many so teams and double-hats work.
create table if not exists public.post_holders (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  member_id    uuid references public.members(id) on delete set null,
  holder_name  text,                              -- used when no member row exists yet
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Helpful indexes for the board reads
create index if not exists departments_division_idx  on public.departments(division_id);
create index if not exists sections_department_idx    on public.sections(department_id);
create index if not exists posts_department_idx        on public.posts(department_id);
create index if not exists posts_section_idx           on public.posts(section_id);
create index if not exists post_holders_post_idx       on public.post_holders(post_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Enabled on every table from the start. Policy for slice 1a: any authenticated
-- member can select/insert/update/delete. The app reaches the DB with the
-- service-role key (which bypasses RLS) from server code only; the anon client
-- is never used for member-spanning reads.
-- ---------------------------------------------------------------------------

alter table public.divisions    enable row level security;
alter table public.departments  enable row level security;
alter table public.sections     enable row level security;
alter table public.posts        enable row level security;
alter table public.members      enable row level security;
alter table public.post_holders enable row level security;

drop policy if exists divisions_authenticated_all on public.divisions;
create policy divisions_authenticated_all on public.divisions
  for all to authenticated using (true) with check (true);

drop policy if exists departments_authenticated_all on public.departments;
create policy departments_authenticated_all on public.departments
  for all to authenticated using (true) with check (true);

drop policy if exists sections_authenticated_all on public.sections;
create policy sections_authenticated_all on public.sections
  for all to authenticated using (true) with check (true);

drop policy if exists posts_authenticated_all on public.posts;
create policy posts_authenticated_all on public.posts
  for all to authenticated using (true) with check (true);

drop policy if exists members_authenticated_all on public.members;
create policy members_authenticated_all on public.members
  for all to authenticated using (true) with check (true);

drop policy if exists post_holders_authenticated_all on public.post_holders;
create policy post_holders_authenticated_all on public.post_holders
  for all to authenticated using (true) with check (true);
