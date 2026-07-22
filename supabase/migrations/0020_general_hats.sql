-- OT Committee Coordination System — Slice 4
-- 0020_general_hats.sql : committee-level hat material, not tied to any post
--
-- Post hats (0017 post_writeups) answer "here is YOUR job". General hats answer
-- "here is what EVERY OT Committee member needs to know" — the member hat, the
-- meeting guidelines, the reference material. Same long-form body format as a
-- post hat (## sections, bullets, **bold**) so both render through one component.
--
-- Two tables, because the GROUP is data, not code:
--   general_hat_groups  the categories (Required Reading, Reference, …)
--   general_hats        the write-ups, each in one group
-- Adding a third category later is an INSERT, not a migration + code change.
-- Ordering is explicit (sort_order) inside each group; admins reorder in-app.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table. Who may WRITE
-- is enforced in the action (admin); everyone reads.

create table if not exists general_hat_groups (
  key         text primary key,          -- stable slug, referenced by general_hats
  label       text not null,             -- what the page calls it
  blurb       text,                      -- one line under the group heading
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists general_hats (
  id          uuid primary key default gen_random_uuid(),
  group_key   text not null references general_hat_groups(key) on update cascade,
  title       text not null,
  body        text not null default '',
  sort_order  integer not null default 0,
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references members(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index if not exists general_hats_group_idx on general_hats(group_key, sort_order);

-- The two categories the committee starts with. ON CONFLICT DO NOTHING so a
-- re-run never clobbers a label an admin has since edited.
insert into general_hat_groups (key, label, blurb, sort_order) values
  ('required-reading', 'Required Reading',
   'What every OT Committee member reads to be hatted.', 1),
  ('reference', 'Reference',
   'Material to consult as needed.', 2)
on conflict (key) do nothing;

alter table general_hat_groups enable row level security;
drop policy if exists general_hat_groups_authenticated_all on general_hat_groups;
create policy general_hat_groups_authenticated_all on general_hat_groups
  for all to authenticated using (true) with check (true);

alter table general_hats enable row level security;
drop policy if exists general_hats_authenticated_all on general_hats;
create policy general_hats_authenticated_all on general_hats
  for all to authenticated using (true) with check (true);

select current_schema() as schema,
       (select count(*) from general_hat_groups) as groups,
       (select count(*) from general_hats) as hats;
