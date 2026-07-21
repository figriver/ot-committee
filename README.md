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
