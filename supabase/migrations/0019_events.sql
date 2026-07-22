-- OT Committee Coordination System — Events
-- 0019_events.sql : events — the FIRST parent type for the 0018 checklist core
--
-- An event is a dated thing the committee puts on: a fundraiser, a recruitment
-- drive, a Dianetics seminar, a Bridge event. It carries the who/what/when —
--
--   name / event_type / event_date
--   owner_member_id  = the I/C, the one person answerable for it
--   area_post_id     = where it hangs on the org board (default: the Div 4
--                      OT Events Officer post — resolved by TITLE in
--                      lib/events.ts, since post ids differ per schema)
--   notes            = optional free text
--
-- — and its EXECUTION lives entirely in `checklist_items` with
-- parent_type = 'event' (0018). There is no events_checklist table on purpose:
-- the checklist is the reusable primitive, an event is merely the first thing
-- to own one.
--
-- CONFIRMS / ATTENDANCE. Headcounts, deliberately: `confirmed_count` (said
-- they're coming) and `attended_count` (actually came), each with who recorded
-- them and when. Per-person attendance is a later table
-- (`event_attendees(event_id, member_id, confirmed, attended)`) that would sum
-- INTO these columns rather than replace them — nothing here has to change to
-- add it.
--
-- FEEDING WINS LATER. A well-attended event is a win, and the wins feed (0015)
-- wants exactly: a date, an area post, a body, and an attributed member. This
-- table carries event_date → win_date, area_post_id → area_post_id,
-- owner_member_id → member_id, and the counts to write the sentence with. That
-- promotion is NOT built here: no trigger, no auto-created win. It stays a
-- deliberate human act until the committee asks for it.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table. WHO may write
-- is enforced in the server actions (admins and the event's owner); every
-- logged-in member reads.

create table if not exists events (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  event_type            text not null default 'other',
  event_date            date not null,

  owner_member_id       uuid references members(id) on delete set null, -- the I/C
  area_post_id          uuid references posts(id) on delete set null,
  notes                 text,

  -- headcounts (NULL = not recorded yet, which is different from zero)
  confirmed_count       integer,
  attended_count        integer,
  attendance_updated_by uuid references members(id) on delete set null,
  attendance_updated_at timestamptz,

  created_by            uuid references members(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_by            uuid references members(id) on delete set null,
  updated_at            timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'events_type_chk' and n.nspname = current_schema()
  ) then
    alter table events add constraint events_type_chk
      check (event_type in ('fundraiser', 'recruitment', 'dianetics_seminar', 'bridge_event', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'events_name_chk' and n.nspname = current_schema()
  ) then
    alter table events add constraint events_name_chk check (btrim(name) <> '');
  end if;

  -- A headcount is a count. Negative is data corruption, not "unknown" (NULL is).
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'events_counts_chk' and n.nspname = current_schema()
  ) then
    alter table events add constraint events_counts_chk
      check (coalesce(confirmed_count, 0) >= 0 and coalesce(attended_count, 0) >= 0);
  end if;
end $$;

-- The calendar read is a date-range scan; the list and conflict check are the
-- same index.
create index if not exists events_date_idx  on events(event_date);
create index if not exists events_owner_idx on events(owner_member_id);
create index if not exists events_area_idx  on events(area_post_id);

alter table events enable row level security;
drop policy if exists events_authenticated_all on events;
create policy events_authenticated_all on events
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Orphan protection for the polymorphic checklist (0018).
--
-- checklist_items.parent_id cannot be a foreign key, so each parent type owns a
-- trigger that drops its items when the parent goes. This is the pattern Slice 4
-- copies for projects / programs / orders — three lines each, and the primitive
-- never has to know what its parents are.
-- ---------------------------------------------------------------------------
do $$
begin
  execute format(
    $f$
    create or replace function %1$I.events_drop_checklist_items()
      returns trigger
      language plpgsql
      set search_path = %1$I
    as $body$
    begin
      delete from checklist_items where parent_type = 'event' and parent_id = old.id;
      return old;
    end
    $body$;
    $f$, current_schema());
end $$;

drop trigger if exists events_drop_checklist_items_trg on events;
create trigger events_drop_checklist_items_trg
  before delete on events
  for each row execute function events_drop_checklist_items();

select current_schema() as schema, (select count(*) from events) as events;
