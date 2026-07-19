-- OT Committee Coordination System — Slice 1b (login gate)
-- 0004_auth_members.sql : member allowlist + roles for magic-link auth
--
-- The board goes behind a login. Only pre-approved emails (rows in members) may
-- log in. Each member has a role (admin | member) and a status (invited | active).
-- auth_uid (already on members) is wired to the Supabase auth user on first login.
--
-- michael@figriverconsulting.com is seeded as the first admin so he can log in
-- day one and invite others.
--
-- Pure SQL only, idempotent — safe to re-run. RLS is already enabled on members
-- (0001); all member access is server-side via the service-role client.

-- Slice 1b is email-only (no name/profile fields), so name is now optional.
alter table public.members alter column name drop not null;

alter table public.members
  add column if not exists role text not null default 'member';
alter table public.members
  add column if not exists status text not null default 'invited';

-- Constrain the enum-like columns.
alter table public.members drop constraint if exists members_role_chk;
alter table public.members
  add constraint members_role_chk check (role in ('admin', 'member'));

alter table public.members drop constraint if exists members_status_chk;
alter table public.members
  add constraint members_status_chk check (status in ('invited', 'active'));

-- One row per email (case-insensitive) — the allowlist key.
create unique index if not exists members_email_unique
  on public.members (lower(email));

-- Seed the first admin (only if not already present).
insert into public.members (email, role, status)
select 'michael@figriverconsulting.com', 'admin', 'invited'
where not exists (
  select 1 from public.members
  where lower(email) = lower('michael@figriverconsulting.com')
);

-- Ensure that address is an admin even if the row already existed.
update public.members
set role = 'admin'
where lower(email) = lower('michael@figriverconsulting.com');

-- Confirmation.
select id, email, role, status, (auth_uid is not null) as linked
from public.members
order by role desc, email;
