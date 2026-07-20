-- OT Committee Coordination System — stats import
-- 0014_adjustable_stats.sql : the ADJUSTABLE-STAT type
--
-- An adjustable stat's weekly value = a SYSTEM-COMPUTED base + a MANUAL
-- adjustment that REQUIRES a note. The base kind says where the base comes from:
--
--   hours_sum      — sum of that week's member_hours (the committee's Hours)
--   active_members — count of members who reported hours that week
--   none           — no system base (Target Dones, until Programs/Compliance
--                    exists); the value is fully manual
--
-- The MANUAL side lives in stat_adjustments: one row per stat per week, holding
-- the manual amount, a REQUIRED note, and — for stats where the manual part is
-- "named people not in the system" (Active Members) — the list of names, so we
-- can count distinct people and later reconcile against real members without
-- double-counting.
--
-- Historical import: no system base existed then, so the whole spreadsheet value
-- is loaded into the manual side (with source='import').
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Pure SQL + one do-block, idempotent.

-- ---- Mark a stat as adjustable + how its base is computed ----------------------
alter table stats
  add column if not exists is_adjustable boolean not null default false;
alter table stats
  add column if not exists base_kind text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'stats_base_kind_chk' and n.nspname = current_schema()
  ) then
    alter table stats add constraint stats_base_kind_chk
      check (base_kind in ('none', 'hours_sum', 'active_members'));
  end if;
end $$;

-- ---- The manual side: one adjustment per stat per week -------------------------
-- note is REQUIRED (not null + non-empty) — the manual amount cannot exist
-- without one. names_json holds the named people for a "named people" manual
-- (Active Members): a JSON array of strings, distinct-counted for the total.
create table if not exists stat_adjustments (
  id            uuid primary key default gen_random_uuid(),
  stat_id       uuid not null references stats(id) on delete cascade,
  week_ending   date not null,
  manual_amount numeric not null default 0,
  note          text not null,
  names_json    text,                       -- JSON array of names, or null
  source        text not null default 'manual',  -- 'manual' | 'import'
  created_by    uuid references members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references members(id) on delete set null,
  constraint stat_adjustments_unique unique (stat_id, week_ending),
  constraint stat_adjustments_note_chk check (length(btrim(note)) > 0)
);

create index if not exists stat_adjustments_stat_week_idx
  on stat_adjustments(stat_id, week_ending);

-- ---- RLS — same posture as every other table ----------------------------------
alter table stat_adjustments enable row level security;
drop policy if exists stat_adjustments_authenticated_all on stat_adjustments;
create policy stat_adjustments_authenticated_all on stat_adjustments
  for all to authenticated using (true) with check (true);

select current_schema() as schema,
  (select count(*) from information_schema.columns
     where table_schema = current_schema() and table_name='stats'
       and column_name in ('is_adjustable','base_kind')) as stat_cols,
  (select count(*) from stat_adjustments) as adjustments;
