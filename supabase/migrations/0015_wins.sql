-- OT Committee Coordination System — Slice 3
-- 0015_wins.sql : the Wins / Results feed
--
-- Wins are the committee's NARRATIVE production (distinct from stats = numbers):
-- individual dated records of a win / result / good news, tagged to an org-board
-- AREA (a post, which rolls up through the existing division/dept structure) and
-- attributed to a MEMBER or explicitly UNATTRIBUTED.
--
-- Attribution mirrors the adjustable-stat "unassigned" idea: a win is either
-- tied to a member or explicitly unattributed — never a fake member. Maps to
-- Department 18 (Success).
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README). Pure SQL
-- + one do-block, idempotent. RLS on, service-role access — same as every table.

create table if not exists wins (
  id              uuid primary key default gen_random_uuid(),
  body            text not null,
  win_date        date not null,
  week_ending     date not null,          -- the reporting week win_date falls in
  area_post_id    uuid references posts(id) on delete set null,  -- tagged area
  member_id       uuid references members(id) on delete set null, -- null = unattributed
  is_unattributed boolean not null default false,
  created_by      uuid references members(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- A win is EITHER member-attributed or explicitly unattributed — an unattributed
-- win must carry no member. (An attributed win with a member is the normal case;
-- a member_id may also be null on a non-unattributed legacy row, so we only
-- forbid the contradictory combination.)
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'wins_attribution_chk' and n.nspname = current_schema()
  ) then
    alter table wins add constraint wins_attribution_chk
      check (not (is_unattributed and member_id is not null));
  end if;
end $$;

create index if not exists wins_week_idx        on wins(week_ending desc);
create index if not exists wins_date_idx        on wins(win_date desc);
create index if not exists wins_area_idx         on wins(area_post_id);
create index if not exists wins_member_idx       on wins(member_id);

alter table wins enable row level security;
drop policy if exists wins_authenticated_all on wins;
create policy wins_authenticated_all on wins
  for all to authenticated using (true) with check (true);

select current_schema() as schema, (select count(*) from wins) as wins;
