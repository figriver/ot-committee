-- OT Committee Coordination System
-- supabase/seeds/dev_seed.sql : throwaway demo data for the `dev` schema
--
-- SAFE BY CONSTRUCTION: every write in this file targets dev.*. The only
-- reference to public.* is a READ (copying the org-board skeleton so the app
-- has a board to render). Nothing here writes to production.
--
-- Re-runnable: it TRUNCATEs the dev tables first, so dev is always rebuilt from
-- scratch. Never point this at `public`.
--
-- What it seeds:
--   * the org-board structure (divisions/departments/sections/posts) copied
--     from public, so dev looks like the real board — but with NO real people
--     (post_holders, members, stats, entries and notes are all fabricated);
--   * demo members (fake @example.com people) + michael as the dev admin so a
--     local login works against dev;
--   * one named stat with ~12 weeks of varied values including NR gaps and
--     up/down swings for the graph, plus weekly hours;
--   * two notes flagged show_on_graph so the graph markers render.

begin;

truncate
  dev.stat_notes, dev.stat_entries, dev.member_hours, dev.stats,
  dev.post_holders, dev.posts, dev.sections, dev.departments, dev.divisions,
  dev.members, dev.board_meta, dev.settings
  restart identity cascade;

-- ---------------------------------------------------------------------------
-- 1. Org-board skeleton — copied (read-only) from public, ids preserved
-- ---------------------------------------------------------------------------

insert into dev.divisions (id, number, name, vfp, color, sort_order, created_at)
select id, number, name, vfp, color, sort_order, created_at from public.divisions;

insert into dev.departments (id, division_id, number, name, vfp, sort_order, created_at)
select id, division_id, number, name, vfp, sort_order, created_at from public.departments;

insert into dev.sections (id, department_id, name, vfp, sort_order, created_at)
select id, department_id, name, vfp, sort_order, created_at from public.sections;

insert into dev.posts (id, department_id, section_id, title, purpose, product,
                       senior_post_id, is_vacant, sort_order, created_at, division_id)
select id, department_id, section_id, title, purpose, product,
       senior_post_id, is_vacant, sort_order, created_at, division_id
from public.posts;

-- Self/late references, once both sides exist.
update dev.divisions d
set head_exec_post_id = p.head_exec_post_id
from public.divisions p where p.id = d.id;

update dev.departments d
set head_post_id = p.head_post_id
from public.departments p where p.id = d.id;

insert into dev.board_meta (id, vfp, updated_at)
select id, vfp, updated_at from public.board_meta;

insert into dev.settings (key, value, updated_at)
select key, value, updated_at from public.settings;

-- ---------------------------------------------------------------------------
-- 2. Demo members (all fabricated; michael is here only as the dev allowlist
--    entry so a local login reaches the dev board)
-- ---------------------------------------------------------------------------

insert into dev.members (id, name, email, role, status) values
  ('11111111-1111-4111-8111-111111111111', 'Ann Example',   'ann@example.com',   'member', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'Bo Sample',     'bo@example.com',    'member', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'Cy Testerson',  'cy@example.com',    'member', 'invited'),
  ('44444444-4444-4444-8444-444444444444', 'Dev Admin',     'michael@figriverconsulting.com', 'admin', 'invited');

-- ---------------------------------------------------------------------------
-- 3. Put the demo people on posts (department heads of Division 4 Production)
-- ---------------------------------------------------------------------------

insert into dev.post_holders (post_id, member_id, holder_name, sort_order)
select d.head_post_id, m.id, m.name, 0
from dev.departments d
join dev.divisions v on v.id = d.division_id and v.number = 4
join lateral (
  select id, name from dev.members
  where email in ('ann@example.com', 'bo@example.com', 'cy@example.com')
  order by email
  offset (d.number % 3) limit 1
) m on true
where d.head_post_id is not null;

-- ---------------------------------------------------------------------------
-- 3b. The dev admin (michael) holds TWO posts, so logging in against dev shows
--     a multi-post dashboard (slice 2d): stats from both posts on one page.
--     Posts chosen deterministically: Division 4's head Secretary, and the head
--     post of Division 1's first department.
-- ---------------------------------------------------------------------------

insert into dev.post_holders (post_id, member_id, holder_name, sort_order)
select p.id, '44444444-4444-4444-8444-444444444444', 'Dev Admin', 0
from dev.posts p
join dev.divisions v on v.id = p.division_id
where v.number = 4
limit 1;

insert into dev.post_holders (post_id, member_id, holder_name, sort_order)
select d.head_post_id, '44444444-4444-4444-8444-444444444444', 'Dev Admin', 0
from dev.departments d
join dev.divisions v on v.id = d.division_id and v.number = 1
where d.head_post_id is not null
order by d.sort_order
limit 1;

-- ---------------------------------------------------------------------------
-- 3c. The dev admin also holds the OT COMMITTEE CHAIRMAN post — mirroring
--     production, where the Chairman is filled and (almost) everything else is
--     HFA. This is what makes the roll-up visible: every unfilled branch with no
--     filled post between it and the top resolves to the Chairman.
-- ---------------------------------------------------------------------------

insert into dev.post_holders (post_id, member_id, holder_name, sort_order)
select p.id, '44444444-4444-4444-8444-444444444444', 'Dev Admin', 0
from dev.posts p
where p.title = 'OT Committee Chairman'
limit 1;

-- ---------------------------------------------------------------------------
-- 4. A named stat on Ann's post + ~12 weeks of values
--    Week endings are Wednesdays, anchored on the Wed on/after today, so the
--    demo history always sits in the recent past.
-- ---------------------------------------------------------------------------

insert into dev.stats (id, post_id, name, active, rollup)
select '55555555-5555-4555-8555-555555555555',
       ph.post_id, 'Bodies in the Shop', true, 'sum'
from dev.post_holders ph
join dev.members m on m.id = ph.member_id and m.email = 'ann@example.com'
limit 1;

-- weeks_back -> value. Missing weeks_back (9 and 4) are deliberate NR gaps:
-- no row at all, which is how the app distinguishes "not reported" from 0.
with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, value, hours) as (
  values (11, 12, 8), (10, 18, 11), (8, 21, 12), (7, 19, 9), (6, 26, 14),
         (5, 31, 15), (3, 24, 10), (2, 33, 16), (1, 41, 18), (0, 38, 13)
)
insert into dev.stat_entries (stat_id, member_id, week_ending, value)
select '55555555-5555-4555-8555-555555555555',
       '11111111-1111-4111-8111-111111111111',
       (a.this_wed - (d.weeks_back * 7)),
       d.value
from anchor a, demo d;

with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, hours) as (
  values (11, 8), (10, 11), (9, 6), (8, 12), (7, 9), (6, 14),
         (5, 15), (3, 10), (2, 16), (1, 18), (0, 13)
)
insert into dev.member_hours (member_id, week_ending, hours)
select '11111111-1111-4111-8111-111111111111',
       (a.this_wed - (d.weeks_back * 7)),
       d.hours
from anchor a, demo d;

-- ---------------------------------------------------------------------------
-- 4b. Two stats on the dev admin's two posts, with different ROLLUP rules, so
--     the 2d dashboard shows several cards at once and the Monthly/Quarterly
--     view proves each card states its own rule (summing a percentage would be
--     nonsense — see 0010).
-- ---------------------------------------------------------------------------

insert into dev.stats (id, post_id, name, active, rollup)
select '66666666-6666-4666-8666-666666666666', p.id, 'Letters Out', true, 'sum'
from dev.posts p
join dev.divisions v on v.id = p.division_id
where v.number = 4
limit 1;

insert into dev.stats (id, post_id, name, active, rollup)
select '77777777-7777-4777-8777-777777777777', d.head_post_id,
       'Percent of OTC Stats Rising', true, 'average'
from dev.departments d
join dev.divisions v on v.id = d.division_id and v.number = 1
where d.head_post_id is not null
order by d.sort_order
limit 1;

-- Letters Out: a clear climb with one NR gap and two drops.
with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, value) as (
  values (11, 40), (10, 52), (9, 48), (8, 61), (7, 75), (5, 70),
         (4, 88), (3, 96), (2, 91), (1, 110), (0, 124)
)
insert into dev.stat_entries (stat_id, member_id, week_ending, value)
select '66666666-6666-4666-8666-666666666666',
       '44444444-4444-4444-8444-444444444444',
       (a.this_wed - (d.weeks_back * 7)), d.value
from anchor a, demo d;

-- Percent rising: a rate, so it stays in 0-100 and averages on rollup.
with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, value) as (
  values (11, 55), (10, 62), (9, 58), (8, 71), (6, 66), (5, 74),
         (4, 80), (3, 77), (2, 85), (1, 83), (0, 90)
)
insert into dev.stat_entries (stat_id, member_id, week_ending, value)
select '77777777-7777-4777-8777-777777777777',
       '44444444-4444-4444-8444-444444444444',
       (a.this_wed - (d.weeks_back * 7)), d.value
from anchor a, demo d;

-- The dev admin's own hours (the dashboard's first card).
with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, hours) as (
  values (11, 14), (10, 16), (9, 12), (8, 18), (7, 15), (6, 20),
         (4, 17), (3, 22), (2, 19), (1, 24), (0, 21)
)
insert into dev.member_hours (member_id, week_ending, hours)
select '44444444-4444-4444-8444-444444444444',
       (a.this_wed - (d.weeks_back * 7)), d.hours
from anchor a, demo d;

-- ---------------------------------------------------------------------------
-- 4c. Sparse-data fixtures: a brand-new stat with NO weeks reported, and one
--     with exactly ONE week. Both are on the dev admin's post so they appear on
--     the dashboard, and they are what the "not enough data yet" states are
--     tested against — a lone dot must read as waiting for data, not broken.
-- ---------------------------------------------------------------------------

insert into dev.stats (id, post_id, name, active, rollup)
select '88888888-8888-4888-8888-888888888888', p.id, 'Brand New Stat (no data)', true, 'sum'
from dev.posts p
join dev.divisions v on v.id = p.division_id
where v.number = 4
limit 1;

insert into dev.stats (id, post_id, name, active, rollup)
select '99999999-9999-4999-8999-999999999999', p.id, 'Just Started (one week)', true, 'sum'
from dev.posts p
join dev.divisions v on v.id = p.division_id
where v.number = 4
limit 1;

-- Exactly one reported week for the second one. (The first gets no entries at all.)
with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
)
insert into dev.stat_entries (stat_id, member_id, week_ending, value)
select '99999999-9999-4999-8999-999999999999',
       '44444444-4444-4444-8444-444444444444',
       a.this_wed, 7
from anchor a;

-- ---------------------------------------------------------------------------
-- 4d. A stat in a THIRD division, held by nobody. The committee view (2e) shows
--     every stat regardless of holder, so this proves the committee dashboard is
--     not filtered to the logged-in member the way /dashboard is — and it gives
--     the group view more than one area to page through.
-- ---------------------------------------------------------------------------

insert into dev.stats (id, post_id, name, active, rollup)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', d.head_post_id, 'Weekly Income', true, 'sum'
from dev.departments d
join dev.divisions v on v.id = d.division_id and v.number = 3
where d.head_post_id is not null
order by d.sort_order
limit 1;

with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
), demo(weeks_back, value) as (
  values (9, 1200), (8, 1450), (7, 1100), (6, 1800), (5, 2100),
         (4, 1950), (3, 2400), (2, 2250), (1, 2800), (0, 3100)
)
insert into dev.stat_entries (stat_id, member_id, week_ending, value)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '22222222-2222-4222-8222-222222222222',
       (a.this_wed - (d.weeks_back * 7)), d.value
from anchor a, demo d;

-- ---------------------------------------------------------------------------
-- 5. Notes, including two flagged to show on the graph
-- ---------------------------------------------------------------------------

with anchor as (
  select (current_date + ((3 - extract(dow from current_date)::int + 7) % 7))::date as this_wed
)
insert into dev.stat_notes (subject_type, subject_id, note_date, body, show_on_graph, created_by)
select 'stat', '55555555-5555-4555-8555-555555555555'::uuid,
       a.this_wed - 56, 'DEMO: new promo cycle started — expect a rise.', true,
       '11111111-1111-4111-8111-111111111111'::uuid from anchor a
union all
select 'stat', '55555555-5555-4555-8555-555555555555'::uuid,
       a.this_wed - 21, 'DEMO: two weeks off for the holidays (the dip).', true,
       '11111111-1111-4111-8111-111111111111'::uuid from anchor a
union all
select 'hours', '11111111-1111-4111-8111-111111111111'::uuid,
       a.this_wed - 35, 'DEMO: unflagged note, table only.', false,
       '11111111-1111-4111-8111-111111111111'::uuid from anchor a
union all
-- Flagged notes on the dev admin's stat + hours, so the 2d dashboard cards show
-- note markers, not just lines.
select 'stat', '66666666-6666-4666-8666-666666666666'::uuid,
       a.this_wed - 49, 'DEMO: mailing list cleaned up — volume jumps here.', true,
       '44444444-4444-4444-8444-444444444444'::uuid from anchor a
union all
select 'hours', '44444444-4444-4444-8444-444444444444'::uuid,
       a.this_wed - 28, 'DEMO: took on the Div 1 post as well.', true,
       '44444444-4444-4444-8444-444444444444'::uuid from anchor a;

commit;

-- ---- Verify: dev populated, public untouched -----------------------------------
select 'dev' as schema,
  (select count(*) from dev.divisions)    as divisions,
  (select count(*) from dev.posts)        as posts,
  (select count(*) from dev.members)      as members,
  (select count(*) from dev.stats)        as stats,
  (select count(*) from dev.stat_entries) as entries,
  (select count(*) from dev.stat_notes)   as notes
union all
select 'public',
  (select count(*) from public.divisions),
  (select count(*) from public.posts),
  (select count(*) from public.members),
  (select count(*) from public.stats),
  (select count(*) from public.stat_entries),
  (select count(*) from public.stat_notes);
