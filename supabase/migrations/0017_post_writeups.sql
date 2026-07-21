-- OT Committee Coordination System — Slice 3 fast-follow
-- 0017_post_writeups.sql : the "hat" write-up for each org-board post
--
-- A post's HAT is its write-up: Purpose / Duties / Stats / VFP / references, the
-- long-form definition of the position. One hat per post (UNIQUE post_id). Held
-- as a single formatted (markdown-ish) body so a multi-section document seeds
-- cleanly from a file and reads as one document. Editing records who last wrote
-- it (updated_by/at), consistent with minutes and stat corrections.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. RLS on, service-role access — same as every table. Who may WRITE
-- is enforced in the action (the post's holder or an admin); everyone reads.

create table if not exists post_writeups (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null unique references posts(id) on delete cascade,
  body        text not null default '',
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references members(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index if not exists post_writeups_post_idx on post_writeups(post_id);

alter table post_writeups enable row level security;
drop policy if exists post_writeups_authenticated_all on post_writeups;
create policy post_writeups_authenticated_all on post_writeups
  for all to authenticated using (true) with check (true);

select current_schema() as schema, (select count(*) from post_writeups) as writeups;
