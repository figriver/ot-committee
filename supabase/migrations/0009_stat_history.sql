-- OT Committee Coordination System — Slice 2b
-- 0009_stat_history.sql : correction attribution + dated notes
--
-- Adds two things on top of the 2a stat spine:
--
--  1. "Updated By" attribution. Values in stat_entries / member_hours can now be
--     CORRECTED after the fact from the history table, so each row records which
--     member last wrote it (updated_by) alongside the existing updated_at.
--     Distinct from member_id, which is whose report the value belongs to — an
--     admin correcting someone's week changes updated_by, never member_id.
--
--  2. stat_notes — a dated note attached to EITHER a stat or a member's hours
--     (subject_type + subject_id, so one table serves both history views).
--     show_on_graph flags a note to render as a marker on the graph in slice 2c;
--     2b only stores the flag.
--
-- subject_id is intentionally NOT a foreign key: it points at stats.id when
-- subject_type='stat' and members.id when subject_type='hours'. Orphan cleanup
-- is handled in the app on subject delete.
--
-- Pure SQL, idempotent. RLS enabled, service-role access — same as every other
-- table in this app.

-- ---- Correction attribution ---------------------------------------------------
alter table public.stat_entries
  add column if not exists updated_by uuid references public.members(id) on delete set null;

alter table public.member_hours
  add column if not exists updated_by uuid references public.members(id) on delete set null;

-- ---- Dated notes on a stat or on a member's hours ------------------------------
create table if not exists public.stat_notes (
  id             uuid primary key default gen_random_uuid(),
  subject_type   text not null check (subject_type in ('stat', 'hours')),
  subject_id     uuid not null,
  note_date      date not null,
  body           text not null,
  show_on_graph  boolean not null default false,
  created_by     uuid references public.members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists stat_notes_subject_idx
  on public.stat_notes(subject_type, subject_id, note_date desc);

-- ---- RLS ----------------------------------------------------------------------
alter table public.stat_notes enable row level security;

drop policy if exists stat_notes_authenticated_all on public.stat_notes;
create policy stat_notes_authenticated_all on public.stat_notes
  for all to authenticated using (true) with check (true);

-- ---- Verify -------------------------------------------------------------------
select
  (select count(*) from public.stat_notes) as notes,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='stat_entries'
       and column_name='updated_by') as entries_updated_by,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='member_hours'
       and column_name='updated_by') as hours_updated_by;
