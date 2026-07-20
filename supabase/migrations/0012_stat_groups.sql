-- OT Committee Coordination System — Slice 2e
-- 0012_stat_groups.sql : storage for CUSTOM stat groups
--
-- The committee dashboard renders stats in GROUPS. A group is deliberately an
-- abstract thing — a name + an ordered set of stats + a source:
--
--   'org'    — generated from org structure (one group per division, or per
--              department). NOT stored: it is derived from posts/departments/
--              divisions at read time, so it can never drift from the board.
--   'custom' — a user-made group over an arbitrary set of stats. THESE are what
--              this migration stores.
--
-- 2e ships the org groups and the generic mechanism; the custom-group creation
-- UI is a later slice. The tables land now so that slice is only a UI, and so
-- both schemas already agree.
--
-- SCHEMA-AGNOSTIC: table names are unqualified on purpose. Run once per schema
-- with the search_path set, e.g.
--     set search_path to public, extensions;   -- then this file
--     set search_path to dev, public, extensions;   -- then this file again
-- (see README "Production vs development data" — every migration goes to BOTH).
--
-- Pure SQL + one do-block, idempotent.

create table if not exists stat_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  source      text not null default 'custom',
  sort_order  integer not null default 0,
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ordered membership. A stat may sit in several groups (that is the point of a
-- custom group: cut across the org structure), but only once per group.
create table if not exists stat_group_stats (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references stat_groups(id) on delete cascade,
  stat_id     uuid not null references stats(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint stat_group_stats_unique unique (group_id, stat_id)
);

create index if not exists stat_group_stats_group_idx on stat_group_stats(group_id);
create index if not exists stat_group_stats_stat_idx  on stat_group_stats(stat_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'stat_groups_source_chk'
      and n.nspname = current_schema()
  ) then
    alter table stat_groups add constraint stat_groups_source_chk
      check (source in ('org', 'custom'));
  end if;
end $$;

-- RLS on, service-role access — same posture as every other table here.
alter table stat_groups      enable row level security;
alter table stat_group_stats enable row level security;

drop policy if exists stat_groups_authenticated_all on stat_groups;
create policy stat_groups_authenticated_all on stat_groups
  for all to authenticated using (true) with check (true);

drop policy if exists stat_group_stats_authenticated_all on stat_group_stats;
create policy stat_group_stats_authenticated_all on stat_group_stats
  for all to authenticated using (true) with check (true);

select current_schema() as schema,
  (select count(*) from stat_groups)      as groups,
  (select count(*) from stat_group_stats) as memberships;
