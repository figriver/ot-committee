-- OT Committee Coordination System — Slice 2a
-- 0007_stats.sql : the core weekly stat model
--
-- Model:
--  * HOURS is universal, tied to the MEMBER (member_hours) — one row per member
--    per week, regardless of how many posts they hold.
--  * NAMED production stats are records attached to POSTS (stats). Reported by
--    whoever currently holds the post; the stat + its entries stay on the post
--    when the holder changes (entries key on stat_id + member_id, not the holder).
--  * A weekly report = the member's Hours (once) + a value per named stat on each
--    post they hold.
--  * Week boundary is a SETTING (settings), seeded to end-of-day Wednesday. For
--    slice 2a it is stored only; lock ENFORCEMENT comes later.
--
-- Pure SQL, idempotent. RLS enabled on every new table (all access is server-side
-- via the service-role client, consistent with the rest of the app).

-- ---- Named stats: the master list, attached to posts --------------------------
create table if not exists public.stats (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists stats_post_idx on public.stats(post_id);

-- ---- Stat entries: one value per stat per member per week ----------------------
create table if not exists public.stat_entries (
  id           uuid primary key default gen_random_uuid(),
  stat_id      uuid not null references public.stats(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  week_ending  date not null,
  value        numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint stat_entries_unique unique (stat_id, member_id, week_ending)
);
create index if not exists stat_entries_member_week_idx
  on public.stat_entries(member_id, week_ending);

-- ---- Member hours: one value per member per week (Hours lives here) ------------
create table if not exists public.member_hours (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  week_ending  date not null,
  hours        numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint member_hours_unique unique (member_id, week_ending)
);

-- ---- Settings: key/value config -----------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- Week lock = end of day Wednesday (dow 3, where Sun=0 .. Sat=6), 23:59.
insert into public.settings (key, value)
select 'week_lock_dow', '3'
where not exists (select 1 from public.settings where key = 'week_lock_dow');
insert into public.settings (key, value)
select 'week_lock_time', '23:59'
where not exists (select 1 from public.settings where key = 'week_lock_time');

-- ---- RLS ----------------------------------------------------------------------
alter table public.stats        enable row level security;
alter table public.stat_entries enable row level security;
alter table public.member_hours enable row level security;
alter table public.settings     enable row level security;

drop policy if exists stats_authenticated_all on public.stats;
create policy stats_authenticated_all on public.stats
  for all to authenticated using (true) with check (true);

drop policy if exists stat_entries_authenticated_all on public.stat_entries;
create policy stat_entries_authenticated_all on public.stat_entries
  for all to authenticated using (true) with check (true);

drop policy if exists member_hours_authenticated_all on public.member_hours;
create policy member_hours_authenticated_all on public.member_hours
  for all to authenticated using (true) with check (true);

drop policy if exists settings_authenticated_all on public.settings;
create policy settings_authenticated_all on public.settings
  for all to authenticated using (true) with check (true);

select
  (select count(*) from public.stats)        as stats,
  (select count(*) from public.stat_entries) as entries,
  (select count(*) from public.member_hours) as hours,
  (select value from public.settings where key='week_lock_dow')  as lock_dow,
  (select value from public.settings where key='week_lock_time') as lock_time;
