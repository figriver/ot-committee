-- OT Committee Coordination System
-- 0003_exec_assignments.sql : make the exec-over-division grouping editable
--
-- Adds divisions.head_exec_post_id — a link from each division to the executive
-- post it reports to. Replaces the hardcoded Comms(7/1/2) / Org(3/4/5/6) split:
-- the current split is SEEDED here as the default, but every division is now
-- freely reassignable to any executive post under the Chairman.
--
-- An "executive" is any post whose senior_post_id is the OT Committee Chairman.
-- Pure SQL only, idempotent — safe to re-run.

alter table public.divisions
  add column if not exists head_exec_post_id uuid
    references public.posts(id) on delete set null;

create index if not exists divisions_head_exec_idx
  on public.divisions(head_exec_post_id);

-- Seed the current default split (only where not already assigned).
-- Communications Executive Secretary over Divisions 7, 1, 2.
update public.divisions d
set head_exec_post_id = (
  select id from public.posts
  where title = 'OTC Communications Executive Secretary'
  limit 1
)
where d.number in (7, 1, 2)
  and d.head_exec_post_id is null;

-- Organization Executive Secretary over Divisions 3, 4, 5, 6.
update public.divisions d
set head_exec_post_id = (
  select id from public.posts
  where title = 'OTC Organization Executive Secretary'
  limit 1
)
where d.number in (3, 4, 5, 6)
  and d.head_exec_post_id is null;

-- Confirmation: every division should now have a heading exec.
select d.number, d.name, p.title as head_exec
from public.divisions d
left join public.posts p on p.id = d.head_exec_post_id
order by d.sort_order;
