-- OT Committee Coordination System
-- 0006_board_meta.sql : a home for board-level settings (currently the overall VFP)
--
-- The board-wide "Valuable Final Product" was previously derived from Division 7
-- and hardcoded in the layout, so it couldn't be edited. Store it as a single
-- board_meta row so it edits/persists like the division and department VFPs.
--
-- Pure SQL, idempotent. RLS enabled (all data access is server-side service-role,
-- consistent with the other tables).

create table if not exists public.board_meta (
  id         uuid primary key default gen_random_uuid(),
  vfp        text,
  updated_at timestamptz not null default now()
);

alter table public.board_meta enable row level security;

drop policy if exists board_meta_authenticated_all on public.board_meta;
create policy board_meta_authenticated_all on public.board_meta
  for all to authenticated using (true) with check (true);

-- Seed exactly one row with the canonical board-wide VFP (only if the table is
-- empty, so re-running never clobbers an edited value). Note this is the OVERALL
-- board VFP from the official template — distinct from Division 7's VFP.
insert into public.board_meta (vfp)
select 'Volumes of public moved up The Bridge to full OT'
where not exists (select 1 from public.board_meta);

select id, vfp from public.board_meta;
