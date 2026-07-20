-- OT Committee Coordination System
-- 0008_head_posts.sql : designate a HEAD post for every division and department.
--
-- Findings from the seed:
--  * Each DEPARTMENT already has its Director as its first post → just mark it.
--  * DIVISIONS have no per-division Secretary post → create one (division-level:
--    department_id NULL, division_id set). A division head lives at the division
--    level, not inside a department.
--
-- Adds:
--  * posts.division_id  — a post that heads a division (department_id is NULL).
--  * posts.department_id — now nullable (division-head posts have no department).
--  * departments.head_post_id — the department's Director (one of its posts).
--
-- Pure SQL, idempotent. Existing tables already have RLS; posts inherits it.

alter table public.posts alter column department_id drop not null;

alter table public.posts
  add column if not exists division_id uuid references public.divisions(id) on delete cascade;
create index if not exists posts_division_idx on public.posts(division_id);

alter table public.departments
  add column if not exists head_post_id uuid references public.posts(id) on delete set null;
create index if not exists departments_head_post_idx on public.departments(head_post_id);

-- Department heads = the first direct post (the Director) of each department.
-- Only set where unset, so a re-run never overrides a hand-picked head.
update public.departments dpt
set head_post_id = (
  select p.id from public.posts p
  where p.department_id = dpt.id and p.section_id is null
  order by p.sort_order asc
  limit 1
)
where dpt.head_post_id is null
  and exists (
    select 1 from public.posts p
    where p.department_id = dpt.id and p.section_id is null
  );

-- Division heads = one '{Division} Secretary' post per division (division-level).
-- Create only where the division has no division-level post yet.
insert into public.posts (division_id, department_id, title, is_vacant, sort_order)
select v.id, null, v.name || ' Secretary', true, 0
from public.divisions v
where not exists (
  select 1 from public.posts p where p.division_id = v.id
);

select
  (select count(*) from public.departments where head_post_id is not null) as dept_heads,
  (select count(*) from public.posts where division_id is not null)        as division_heads;
