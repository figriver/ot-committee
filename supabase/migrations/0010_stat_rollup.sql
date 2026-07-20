-- OT Committee Coordination System — Slice 2c
-- 0010_stat_rollup.sql : how a stat rolls up to Monthly / Quarterly
--
-- The graph can show Weekly (native), Monthly, or Quarterly. Month and quarter
-- are ROLLUPS of the underlying weekly entries — and the right rollup depends on
-- what the stat measures:
--
--   sum     — counts that accumulate (letters out, bodies in the shop). Default.
--   average — rates and percentages, where summing weeks is meaningless
--             ("% of rising OTC stats" summed over 4 weeks = nonsense).
--   last    — running totals / standings, where the period's closing value is it.
--
-- Hours is always 'sum' (hours accumulate), so it needs no column of its own.
--
-- Pure SQL, idempotent.

alter table public.stats
  add column if not exists rollup text not null default 'sum';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stats_rollup_check'
  ) then
    alter table public.stats
      add constraint stats_rollup_check check (rollup in ('sum', 'average', 'last'));
  end if;
end $$;

select
  (select count(*) from public.stats) as stats,
  (select count(*) from public.stats where rollup = 'sum') as rollup_sum;
