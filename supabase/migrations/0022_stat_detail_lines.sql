-- OT Committee Coordination System — Slice 4
-- 0022_stat_detail_lines.sql : the who/what/where behind a reported number
--
-- The committee's upline report is not a column of numbers: each stat carries a
-- detail table — WHO started service and on what, WHICH donor gave how much,
-- WHAT project the hours went to. Until now only the value was stored, so the
-- report had to be assembled by hand from memory and email.
--
-- TWO PARTS:
--
-- 1. `stats.detail_kind` — which detail table this stat needs, or NULL for a
--    stat that is just a number. It names a spec in lib/stat-details.ts; the
--    FIELDS live in code, not in the schema. Changing what Service Starts
--    collects is a registry edit; pointing a stat at a different spec is a
--    one-row update. Neither needs a migration. (Same shape as the checklist
--    parent registry — see CHECKLIST.md.)
--
-- 2. `stat_detail_lines` — the rows themselves, with their per-spec values in a
--    jsonb `fields` blob validated in code against the spec.
--
-- KEYED BY NATURAL KEY, NOT BY stat_entries.id, on purpose:
--   * submitReport UPSERTS entries, and an entry can be deleted and re-created
--     by a correction — an FK to its id would drop the detail underneath it.
--   * HOURS are not in stat_entries at all (they live in member_hours), and the
--     report wants a project/post breakdown for them too. stat_id IS NULL marks
--     an hours line, which no FK to stat_entries could express.
-- So a line is identified the way a report is: this member, this week, this stat.
--
-- EVENTS DETAIL, deliberately: an event line stores event_name / ic /
-- products_gotten as text TODAY, but the Events subsystem (0019) already holds
-- all three natively. `source_event_id` is here from the start, unused and
-- nullable, so the eventual "generate this line from a real event" is a
-- backfill plus a read path — not a schema change and not a data migration.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table.

alter table stats add column if not exists detail_kind text;

create table if not exists stat_detail_lines (
  id              uuid primary key default gen_random_uuid(),
  -- NULL stat_id = an hours line (member_hours has no stat row).
  stat_id         uuid references stats(id) on delete cascade,
  member_id       uuid not null references members(id) on delete cascade,
  week_ending     date not null,
  subject_type    text not null default 'stat' check (subject_type in ('stat', 'hours')),
  fields          jsonb not null default '{}'::jsonb,
  sort_order      integer not null default 0,
  -- Reserved for generating an Events line from the real event (0019). Unused
  -- today; present so that becomes a read path rather than a migration.
  source_event_id uuid references events(id) on delete set null,
  created_by      uuid references members(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_by      uuid references members(id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint stat_detail_lines_subject_chk
    check ((subject_type = 'stat') = (stat_id is not null))
);

create index if not exists stat_detail_lines_entry_idx
  on stat_detail_lines (stat_id, member_id, week_ending, sort_order);
create index if not exists stat_detail_lines_hours_idx
  on stat_detail_lines (member_id, week_ending)
  where subject_type = 'hours';

alter table stat_detail_lines enable row level security;
drop policy if exists stat_detail_lines_authenticated_all on stat_detail_lines;
create policy stat_detail_lines_authenticated_all on stat_detail_lines
  for all to authenticated using (true) with check (true);

-- Point the stats this committee already reports at their specs. Matched by
-- NAME because that is what the committee calls them; only fills a NULL, so an
-- admin's later change is never clobbered by a re-run.
update stats set detail_kind = 'service_starts'  where detail_kind is null and name ilike 'Service Starts';
update stats set detail_kind = 'funds'           where detail_kind is null and name ilike 'Alliance Funds';
update stats set detail_kind = 'funds'           where detail_kind is null and name ilike 'Ideal Org Funds';
update stats set detail_kind = 'funds'           where detail_kind is null and name ilike 'IAS Funds%';
update stats set detail_kind = 'member_activity' where detail_kind is null and name ilike 'Active Members';
update stats set detail_kind = 'event'           where detail_kind is null and name ilike 'Events';
update stats set detail_kind = 'file_project'    where detail_kind is null and name ilike 'File Pjt%';
update stats set detail_kind = 'joined_staff'    where detail_kind is null and name ilike 'People Joined Staff';
-- Hours are a member-level total, not a stat row: their spec is selected by the
-- hours subject itself (lib/stat-details.ts HOURS_KIND), so nothing to set here.

select current_schema()                                                    as schema,
       (select count(*) from stat_detail_lines)                            as detail_lines,
       (select count(*) from stats where detail_kind is not null)          as stats_with_detail;
