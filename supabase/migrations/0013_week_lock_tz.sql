-- OT Committee Coordination System — stats collection backbone
-- 0013_week_lock_tz.sql : the zone the week-lock TIME is read in
--
-- Weeks lock at week_lock_time on week_lock_dow (seeded in 0007 to Wednesday
-- 23:59). Those settings say WHEN, but not WHERE — and a time of day is
-- meaningless without a zone. The rest of the app does week math in UTC, which
-- is correct for a DATE; applying it to a time of day would close the week at
-- 6:59pm Central rather than the 11:59pm members were told.
--
-- Stored as a setting (not hardcoded) so the committee can change it the same
-- way they can change the day and the time.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent: never overwrites an existing value.

insert into settings (key, value)
select 'week_lock_tz', 'America/Chicago'
where not exists (select 1 from settings where key = 'week_lock_tz');

select current_schema() as schema,
  (select value from settings where key = 'week_lock_dow')  as lock_dow,
  (select value from settings where key = 'week_lock_time') as lock_time,
  (select value from settings where key = 'week_lock_tz')   as lock_tz;
