-- OT Committee Coordination System — Slice 3 fast-follow
-- 0016_meeting_minutes.sql : the record of each week's committee meeting
--
-- Minutes are a per-MEETING text record. One meeting per week (the Thursday
-- meeting), so minutes key to a week — UNIQUE on week_ending, one record per
-- meeting. Distinct from wins: minutes stay WITH their meeting and are NOT part
-- of wins roundups. Editing records who last touched them (updated_by/at),
-- consistent with stat corrections.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table. Who may WRITE
-- is enforced in the action (admin); everyone reads (shared committee record).

create table if not exists meeting_minutes (
  id           uuid primary key default gen_random_uuid(),
  week_ending  date not null unique,   -- one meeting / minutes record per week
  body         text not null default '',
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_by   uuid references members(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table meeting_minutes enable row level security;
drop policy if exists meeting_minutes_authenticated_all on meeting_minutes;
create policy meeting_minutes_authenticated_all on meeting_minutes
  for all to authenticated using (true) with check (true);

select current_schema() as schema, (select count(*) from meeting_minutes) as minutes;
