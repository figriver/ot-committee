# OT Committee Coordination System — Slice 1a

An editable 7-division org board, proven on Division 4 (Production).
Stack: **Next.js (App Router) + Supabase + Vercel**.

Seed is the **blank official CSI template** (`OTCommitteeOrgBd.pdf`, Item 18904R):
7 divisions, 21 departments, every post — all seeded **vacant, no names**. The
board is fully editable (add / rename / reorder / delete for departments,
sections, posts, and holders; VFPs editable at division and department level).

Auth is **not** in this slice (1b adds the magic-link gate). The board is open
locally. RLS is enabled on every table; all DB access is server-side with the
service-role key.

## Setup

1. **Apply the database migrations** (they are NOT applied automatically). In the
   Supabase SQL editor for project `ot-committee`, run in order:
   - `supabase/migrations/0001_init_schema.sql`
   - `supabase/migrations/0002_seed.sql`
2. **Environment variables** — copy `.env.local.example` to `.env.local` and fill
   in from Supabase → Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only — never `NEXT_PUBLIC_`)
   - `DB_SCHEMA=dev` (see **Production vs development data** below — local runs
     must NOT point at the production schema)
3. `npm install`
4. `npm run dev` → open http://localhost:3000/board

## Production vs development data

One Supabase project, **two schemas** with identical table structure. Which one
the app talks to is set by the `DB_SCHEMA` env var (read in
`lib/supabase/server.ts`; unset ⇒ `public`).

| Schema   | What it is                                    | Rule                                                    |
| -------- | --------------------------------------------- | ------------------------------------------------------- |
| `public` | **PRODUCTION** — the real committee record    | **Never seed or test against it.** Read/write only through the deployed app. |
| `dev`    | **DEVELOPMENT / TESTING** — throwaway data     | Seed, truncate, and experiment freely.                  |

- **Vercel production** sets `DB_SCHEMA=public` (and the code default is `public`
  anyway, so a missing value is still safe).
- **Local development and every automated test set `DB_SCHEMA=dev`.** This is the
  rule: *tests run against `dev`.* Before any done-check, seeding, or throwaway
  write, confirm `DB_SCHEMA=dev` is in effect — local and prod share one database,
  so a test that runs with `public` writes into real committee records.
- Auth is **not** schema-split: `auth.users` is shared, so a magic-link login works
  the same against either. The allowlist row (`members`) does live per schema, so
  an email must exist in `dev.members` to log into a dev-pointed app.

Both schemas are created and kept in step by migrations:

- `supabase/migrations/0011_dev_schema.sql` creates `dev` with the full structure
  of `public` (all tables from 0001–0010, same columns, indexes, constraints, RLS).
- `supabase/seeds/dev_seed.sql` fills `dev` with demo data — the org-board skeleton
  copied (read-only) from `public`, then **fabricated** members, holders, a stat
  with ~12 weeks of varied values (including NR gaps), hours, and flagged notes.
  It truncates `dev` first, so re-running rebuilds it from scratch.

**When adding a future migration, apply it to BOTH schemas** — otherwise `dev`
drifts and stops being a valid rehearsal of production. The `dev` schema must also
stay listed in Supabase → Settings → API → Exposed schemas (`public,graphql_public,dev`)
or PostgREST returns `PGRST106` for it.

## Deploy (Vercel)

Set the same env vars in the Vercel project settings, then deploy. Keep
`SUPABASE_SERVICE_ROLE_KEY` unexposed (no `NEXT_PUBLIC_` prefix). Production has
`DB_SCHEMA=public` — never set it to `dev` there.

### ⚠️ `vercel deploy` ships the WORKING TREE, not the last commit

Every file present in the project directory is uploaded unless it is ignored —
**untracked is not the same as excluded.** A half-finished feature sitting in the
working tree goes live the next time anyone deploys, without a commit, a review
or a decision.

This has already bitten once: the events UI (`app/events/`, `lib/events.ts`,
`components/event-*.tsx`) was untracked-but-present and shipped to production
alongside an unrelated deploy, while migrations 0018/0019 had only been applied
to `dev`. The tables did not exist in `public`, so `/events` returned HTTP 500
for every member until the migrations were applied.

**Before any production deploy:**

1. `git status --porcelain` — read what is uncommitted *and* what is untracked.
2. For each thing riding along, decide deliberately: commit it, exclude it in
   `.vercelignore`, or confirm it is safe to ship as-is.
3. For any feature going live, confirm **its migrations are applied to `public`**,
   not just `dev` — code and schema ship on different tracks, and only the code
   ships automatically.
4. Say out loud, in the deploy message, what is riding along.

`.vercelignore` is what actually keeps files out of the upload (it is a superset
of the runtime parts of `.gitignore`, since a `.vercelignore` can *replace*
rather than extend `.gitignore` depending on CLI version). It excludes the import
**source documents** — `hats/`, `reference/`, spreadsheets, Word files — which
carry members' names, emails and phone numbers, are parsed into the database
once, and are never read at build or run time.

### ⚠️ Done-checks run against `dev` only; production gets READ-ONLY verification

**Mutating/destructive done-checks run against DEV ONLY. Production gets
read-only verification. Never create, modify, or delete production rows to prove
a feature works — and never modify a production account's role, even
temporarily: a failure between demote and restore locks the operator out of their
own admin with no one able to restore it.**

This is the sharper edge of the `DB_SCHEMA` rule above. A done-check that walks a
feature end-to-end — creating a record, moving it, flipping a role to prove the
server refuses a non-admin, deleting it again — is exactly the kind of script
that *looks* safe because it cleans up after itself. It is not safe against
`public`:

- Cleanup only runs if the script reaches the end. A timeout, a failed selector
  or a thrown assertion leaves the intermediate state behind — and if that state
  is a demoted admin, **there is no one left with the rights to undo it**.
- Rows written to `public` are real committee records, not fixtures.
- Someone may be using the app while the test runs.

So: run the full mutating walk against `dev`, then verify the deployed site with
**reads only** — HTTP status, rendered content, navigation, search results. If a
behaviour genuinely cannot be observed without a write, that is a signal to
reproduce it in `dev`, not a licence to write to `public`.

## Design system

Tokens and primitives are defined **once** in the DESIGN TOKENS block at the top
of `app/globals.css` and documented in **[DESIGN.md](DESIGN.md)**. Every screen
composes from them, so future slices inherit the polish automatically.

The essentials:

- **Chrome vs. content color.** App chrome is a calm neutral palette + **one**
  desaturated blue accent (`--accent`). The org board's seven division flash
  colors are **content** (from `divisions.color`, applied only to board cards) —
  they never touch nav, buttons, tabs, or surfaces.
- **Light + dark, both first-class.** Colors are semantic tokens with a
  `:root[data-theme='dark']` override. Theme is set pre-paint by an inline
  no-flash script in `app/layout.tsx`, defaults to the OS, and the user's choice
  persists to `localStorage` (toggle in the account bar / login).
- **Scales.** 4-based spacing (`--space-*`), an Inter type scale (`--text-*`),
  one card radius (`--radius`), and a small subtle shadow set. Separate with
  spacing first, hairline border next, shadow only for floating elements.
- **Rule of thumb:** in a component, reach for a token — never a raw hex. If none
  fits, add a *semantic* token with both light and dark values.

## Screens

- `/board` — the 7 divisions as clickable cards (name + VFP, in division color).
- `/board/[n]` — division detail: departments side by side, sections and posts
  inside each, VFPs along the bottom (each department's + the division's).
  Everything is editable in place.
- `/events` — the events **calendar** (month grid; days with more than one event
  are flagged as a clash), with a list view and "Assigned to you".
- `/events/[id]` — one event: its facts, its turnout headcounts, and its
  **checklist**.
- `/post/[id]` — a post's **hat write-up**: Purpose / Duties / Stats / VFP. The
  post's effective holder or an admin edits it in place. Reachable from the
  board: every post box's caret menu opens it.
- `/hatting` — **Post Hats**: a searchable index of every post whose hat is
  written (search matches the post name *and* the hat's text, server-side), with
  the un-hatted posts listed underneath so the gaps stay visible.
- `/hatting/general`, `/hatting/general/[id]` — **General Hats**: committee-level
  hat material that belongs to no post, grouped (Required Reading / Reference).
  Everyone reads; admins create, edit and reorder. (`/hats*` forwards here — the
  old location before Hatting became a top-level nav item.)

## Hats: two kinds, one renderer

A **post hat** (`post_writeups`, migration 0017) answers *"here is your job"*; a
**general hat** (`general_hats`, migration 0020) answers *"here is what every
member needs to know"*. Both are the same kind of document — a markdown subset of
`## sections`, `- bullets` and `**bold**` — so both render through
`components/hat-body.tsx` and are edited by `components/hat-editor.tsx`. Add a
third kind of hat by binding that editor to a new save action, not by writing a
second renderer.

General-hat **groups are data** (`general_hat_groups`), not a union type: a third
category is an `INSERT`, not a migration plus a code change.

## The checklist primitive

`checklist_items` (migration 0018) is **not an events table** — it is the generic
"assignable action with a done-state" that Slice 4's Programs / Projects /
Orders / Compliance will reuse unchanged. Events (migration 0019) are only its
first parent type. Read **[CHECKLIST.md](CHECKLIST.md)** before building anything
that needs "someone has to do this by then" — adding a parent type is a registry
entry, a trigger, and four one-line actions, not a new table.
