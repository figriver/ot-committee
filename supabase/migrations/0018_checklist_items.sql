-- OT Committee Coordination System — Slice 3 fast-follow / Slice 4 groundwork
-- 0018_checklist_items.sql : the ASSIGNABLE ACTION primitive (reusable core)
--
-- This table is deliberately NOT about events. It is the committee's generic
-- unit of execution: "a thing that has to get done, by someone, by when, and is
-- either done or not." Events (0019) are the FIRST parent type; Programs,
-- Projects, Orders and Compliance targets (Slice 4) become further parent types
-- WITHOUT a schema change — they just write a different `parent_type`.
--
--   parent_type + parent_id  = what this item belongs to  (polymorphic owner)
--   title / description      = what has to be done
--   assignee_member_id       = who has it   (NULL = unassigned, on purpose)
--   is_done / done_by / done_at = the done-state, with attribution
--   due_date                 = optional deadline
--   sort_order               = the order the list is worked in
--
-- WHY POLYMORPHIC, not one child table per parent: the committee's execution
-- surfaces (an event checklist, a project's targets, an order's compliance
-- steps) are the SAME object with the same rules — assign, chase, tick off, see
-- who has what. Splitting them would fork that logic four ways and give every
-- future surface its own half-built version of "who hasn't done their bit".
--
-- The price of polymorphism is that Postgres cannot FK `parent_id`. Two things
-- pay it back:
--   1. The parent-type REGISTRY lives in code — `lib/checklist-parents.ts` —
--      which is also where "who may manage items on this parent" is answered.
--      Adding a parent type means adding one entry there, not a migration.
--   2. Each parent table drops its own items on delete via a trigger it owns
--      (see 0019 for the events one), so orphans cannot accumulate.
--
-- See CHECKLIST.md for the full contract and how Slice 4 reuses this.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table. WHO may write
-- is enforced in the server actions (admin/owner assigns; the assignee ticks
-- their own item); everyone reads.

create table if not exists checklist_items (
  id                 uuid primary key default gen_random_uuid(),

  -- the owner of this item: a lowercase slug naming the KIND of parent
  -- ('event' today; 'project' / 'program' / 'order' / 'compliance' later) plus
  -- that parent row's id.
  parent_type        text not null,
  parent_id          uuid not null,

  title              text not null,
  description        text,

  -- NULL assignee is a real state, not missing data: an item can exist before
  -- anyone has been put on it ("someone needs to handle décor"). The UI shows
  -- it as Unassigned so it reads as outstanding rather than invisible.
  assignee_member_id uuid references members(id) on delete set null,
  due_date           date,

  -- done-state with attribution: WHO ticked it and WHEN, so an event debrief
  -- can say more than "it was done at some point".
  is_done            boolean not null default false,
  done_by            uuid references members(id) on delete set null,
  done_at            timestamptz,

  sort_order         integer not null default 0,
  created_by         uuid references members(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
begin
  -- parent_type is a code-level enum (the registry), so the DB only enforces
  -- the SHAPE of a slug. A new parent type must never need a migration.
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'checklist_items_parent_type_chk' and n.nspname = current_schema()
  ) then
    alter table checklist_items add constraint checklist_items_parent_type_chk
      check (parent_type ~ '^[a-z][a-z0-9_]*$');
  end if;

  -- An item with a title of whitespace is a UI bug, not a task.
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'checklist_items_title_chk' and n.nspname = current_schema()
  ) then
    alter table checklist_items add constraint checklist_items_title_chk
      check (btrim(title) <> '');
  end if;

  -- NOT done ⇒ no done attribution. (The converse is deliberately allowed: a
  -- done item may lose its done_by if that member row is deleted.)
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'checklist_items_done_chk' and n.nspname = current_schema()
  ) then
    alter table checklist_items add constraint checklist_items_done_chk
      check (is_done or (done_at is null and done_by is null));
  end if;
end $$;

-- The list read: every item of one parent, in working order.
create index if not exists checklist_items_parent_idx
  on checklist_items(parent_type, parent_id, sort_order);
-- "What do I still have?" across every parent type — the future My Actions view.
create index if not exists checklist_items_assignee_idx
  on checklist_items(assignee_member_id, is_done);
-- Chase-up by deadline.
create index if not exists checklist_items_due_idx
  on checklist_items(due_date) where not is_done;

alter table checklist_items enable row level security;
drop policy if exists checklist_items_authenticated_all on checklist_items;
create policy checklist_items_authenticated_all on checklist_items
  for all to authenticated using (true) with check (true);

select current_schema() as schema, (select count(*) from checklist_items) as checklist_items;
