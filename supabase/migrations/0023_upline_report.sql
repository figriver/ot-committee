-- OT Committee Coordination System — Slice 4
-- 0023_upline_report.sql : the weekly stat report that goes upline
--
-- The committee reports 13 numbered stats to EUS Stats I/C / OTC Int / Chair /
-- D-Chair / PES on a form issued by OTC Int. This adds the three things a stat
-- needs in order to appear on it:
--
--   report_line  — its number on the form (1-13). NULL = not on the report.
--   report_label — its wording ON THE FORM, which is not always what this app
--                  calls it: "File Pjt Attendees" here is line 10 "File Pjt
--                  Volunteers" there, "Target Dones" is line 12 "Compliance
--                  Reports / Targets Done". Renaming the stats to match would
--                  break 170 weeks of history and every graph.
--   definition   — the definition paragraph printed under the value.
--
-- DEFINITIONS ARE DATA, NOT CODE. The form has been stable since 2019, but it is
-- ISSUED — when OTC Int changes the wording, an admin edits it in Settings →
-- Manage Stats and the next report picks it up. No deploy, no migration.
--
-- SEEDING, AND WHAT IS DELIBERATELY NOT SEEDED:
-- Lines 1, 3, 8, 9 and 13 are seeded with their definitions VERBATIM, quoted
-- from the Nashville OTC member hat which reproduces the form's text. The other
-- eight are seeded EMPTY on purpose: inventing the wording of an issued upline
-- form would put words in OTC Int's mouth that read as official. The report
-- marks an empty definition so the operator knows to paste the real text once.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent: only fills what is still NULL, so an admin's edits survive a re-run.

alter table stats add column if not exists report_line  integer;
alter table stats add column if not exists report_label text;
alter table stats add column if not exists definition   text;

create index if not exists stats_report_line_idx on stats (report_line) where report_line is not null;

-- ---- which stat is which line, and what the form calls it -------------------
update stats set report_line = 1,  report_label = coalesce(report_label, 'Service Starts')                   where report_line is null and name ilike 'Service Starts';
update stats set report_line = 2,  report_label = coalesce(report_label, 'Ideal Org Funds')                  where report_line is null and name ilike 'Ideal Org Funds';
update stats set report_line = 3,  report_label = coalesce(report_label, 'Alliance Funds')                   where report_line is null and name ilike 'Alliance Funds';
update stats set report_line = 4,  report_label = coalesce(report_label, 'Total Members')                    where report_line is null and name ilike 'Total OTC Members';
update stats set report_line = 5,  report_label = coalesce(report_label, 'Active Members')                   where report_line is null and name ilike 'Active Members';
update stats set report_line = 6,  report_label = coalesce(report_label, 'Meeting Attendance')               where report_line is null and name ilike 'Meeting Attendance';
update stats set report_line = 7,  report_label = coalesce(report_label, 'Events')                           where report_line is null and name ilike 'Events';
update stats set report_line = 8,  report_label = coalesce(report_label, 'Books Sold')                       where report_line is null and name ilike 'Books Sold';
update stats set report_line = 9,  report_label = coalesce(report_label, 'Hours')                            where report_line is null and name ilike 'Hours';
update stats set report_line = 10, report_label = coalesce(report_label, 'File Pjt Volunteers')              where report_line is null and name ilike 'File Pjt%';
update stats set report_line = 11, report_label = coalesce(report_label, 'People Joined Staff')              where report_line is null and name ilike 'People Joined Staff';
update stats set report_line = 12, report_label = coalesce(report_label, 'Compliance Reports / Targets Done') where report_line is null and name ilike 'Target Dones';
update stats set report_line = 13, report_label = coalesce(report_label, 'IAS Funds')                        where report_line is null and name ilike 'IAS Funds%';

-- ---- the definitions we have the real text for ------------------------------
update stats set definition =
  'This includes all starts on a paid major or minor service, training and processing, including any course on the Golden Age of Knowledge Routes, at a mission or org or Advanced Org taken that week through an OTC Member''s efforts, or by the OTC Member themselves. Refreshers do not count.'
  where definition is null and report_line = 1;

update stats set definition =
  'Each OTC is assigned "Alliance Orgs" that our OTC helps fundraise for. These are funds raised as a result of an Alliance event held. The funds must have been invoiced in the Alliance org. Pledged amounts do not count. It includes all funds raised or paid by the OT Committee members themselves. Note: IAS funds are reported separately.'
  where definition is null and report_line = 3;

update stats set definition =
  'Number of Scientology books sold at OTC events, bookathons, stress tests or other OTC activities, or by OTC members individually. This could be DMSMH or Self Analysis or any other Basic book sold while OTC members are doing dissemination activities. Note that this stat would NOT include pamphlets sold such as the VM Booklets.'
  where definition is null and report_line = 8;

update stats set definition =
  'These include hours OTC members spent on activities that are part of OTC programs, or supporting the OTC and its programs. Includes hours for people who are not OTC members, but who are helping at OTC events, booksales, file projects etc. Note: The projects must be based on the targets of the OT Ambassador Program.'
  where definition is null and report_line = 9;

update stats set definition =
  'This includes funds paid or regged by an OTC member.'
  where definition is null and report_line = 13;

-- The committee's name as it appears in the report header, editable like the
-- definitions rather than hardcoded in the generator.
insert into settings (key, value)
  values ('report_org_name', 'CC Nashville OT Committee')
  on conflict (key) do nothing;

select current_schema()                                                as schema,
       (select count(*) from stats where report_line is not null)      as on_report,
       (select count(*) from stats where definition is not null)       as with_definition;
