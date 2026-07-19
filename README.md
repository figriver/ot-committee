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
3. `npm install`
4. `npm run dev` → open http://localhost:3000/board

## Deploy (Vercel)

Set the same two env vars in the Vercel project settings, then deploy. Keep
`SUPABASE_SERVICE_ROLE_KEY` unexposed (no `NEXT_PUBLIC_` prefix).

## Screens

- `/board` — the 7 divisions as clickable cards (name + VFP, in division color).
- `/board/[n]` — division detail: departments side by side, sections and posts
  inside each, VFPs along the bottom (each department's + the division's).
  Everything is editable in place.
