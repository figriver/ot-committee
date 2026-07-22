-- OT Committee Coordination System — Slice 4
-- 0021_unattached_hats.sql : a hat may exist before it has a post
--
-- 0017 made a hat a property OF a post (post_id NOT NULL, ON DELETE CASCADE), so
-- a hat could only be written by first finding a post to hang it on, and once
-- hung it could never be moved. Both are wrong for how hatting actually happens:
-- someone writes the hat first and works out whose post it is afterwards, and
-- posts get renamed, split and re-manned.
--
-- After this migration:
--   post_id NULL          = an UNATTACHED hat, sitting in the pool
--   post_id NOT NULL      = attached, exactly as before
--   UNIQUE (post_id)      = still one hat per post — Postgres permits many NULLs
--                           in a UNIQUE column, so the pool is unbounded while
--                           the one-hat-per-post rule is untouched.
--
-- An unattached hat needs its own NAME (it cannot borrow the post's), hence the
-- `title` column and the check. Existing hats are backfilled from their post so
-- that detaching one later never leaves it nameless. For an ATTACHED hat the
-- post's title remains what the UI shows; `title` is its fallback.
--
-- ON DELETE CASCADE → SET NULL: deleting a post now returns its hat to the pool
-- instead of destroying a written document. This is the whole point of the
-- change — the hat outlives the post box.
--
-- SCHEMA-AGNOSTIC — run once per schema with search_path set (README).
-- Idempotent. No RLS change: the policy from 0017 still applies.

alter table post_writeups alter column post_id drop not null;
alter table post_writeups add column if not exists title text;

-- Backfill BEFORE the check, or an existing hat would fail it the moment its
-- post is deleted and post_id goes null.
update post_writeups w
   set title = p.title
  from posts p
 where w.post_id = p.id
   and (w.title is null or btrim(w.title) = '');

alter table post_writeups drop constraint if exists post_writeups_named_chk;
alter table post_writeups add constraint post_writeups_named_chk
  check (post_id is not null or btrim(coalesce(title, '')) <> '');

alter table post_writeups drop constraint if exists post_writeups_post_id_fkey;
alter table post_writeups add constraint post_writeups_post_id_fkey
  foreign key (post_id) references posts(id) on delete set null;

-- The pool is listed on its own; index the rows that form it.
create index if not exists post_writeups_unattached_idx
  on post_writeups (updated_at desc) where post_id is null;

select current_schema()                                             as schema,
       (select count(*) from post_writeups)                         as writeups,
       (select count(*) from post_writeups where post_id is null)   as unattached,
       (select count(*) from post_writeups where title is not null) as titled;
