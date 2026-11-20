DRAFT - Fig to confirm

# Build queue: ot-committee

The OT Committee coordination app (Next.js + Supabase + Vercel, live at https://ot-committee.vercel.app): org board, posts and hats, weekly stats with graphs, wins, meeting minutes, events with checklists, and member invites. The newest work is a weekly "upline stat report" that rebuilds the committee's 13-line paper stat form from what members already report, with a .docx download. It sits unfinished on branch `wip/upline-report`, and its migration `0023_upline_report.sql` has not been run on either schema.

| # | Step | Status | Notes |
|---|------|--------|-------|
| 0 | Invite a whole committee in one paste | Done | Commit bbcaa53 on main, deployed to production (dpl_EahQeiVDgaSy338xSfZcBAWT86i5). Still needs a live check: read-only on production, full paste test on dev. |
| 1 | Finish and review the upline report | Next | Branch `wip/upline-report` (40d3883). Migration 0023 not applied anywhere. Adds the `docx` dependency. |
| 2 | Paste in the 8 missing report definitions | Blocked | Needs the official form text from OTC Int (lines 2, 4, 5, 6, 7, 10, 11, 12). Only Fig has it. Comes after step 1. |
| 3 | Check that dev and public schemas match | Queued | Migrations are run by hand, so drift is possible. Read-only. |
| 4 | Projects as a second checklist parent (Slice 4 start) | Queued | CHECKLIST.md describes how. CONFIRM this is the next Slice 4 piece Fig wants. |
| 5 | Custom stat groups: creation screen | Queued | Storage exists since 0012; `lib/groups.ts` says the creation screen is "a later slice". CONFIRM it is still wanted. |

## 1. Finish and review the upline report

```
Repo figriver/ot-committee. Work only on branch wip/upline-report (do not touch main).
Read README.md first, especially the DB_SCHEMA, migration and deploy sections.

Goal: finish the weekly upline stat report at /stats/report (paper-like preview,
previous/next week navigation, .docx download at /stats/report/docx) and the
definition editor in Settings > Manage Stats.

1. Read the branch diff: git diff main...wip/upline-report. Key files:
   lib/upline-report.ts, lib/report-docx.ts, app/stats/report/, supabase/migrations/0023_upline_report.sql.
2. Rehearse migration 0023 on a copy first: run it against the `dev` schema only
   (search_path = dev). Check its closing SELECT: 13 stats on the report, 5 with definitions.
   Run it a second time to prove it is safe to re-run. Do NOT run it on `public`.
3. With DB_SCHEMA=dev, finish whatever is unfinished, then npm run typecheck and npm run build.
4. Push the branch and get its Vercel preview URL. CONFIRM the preview uses DB_SCHEMA=dev;
   if it would use public, stop and ask Fig.
5. Screenshot the report on the preview URL and attach a downloaded .docx.
6. Do not merge and do not apply 0023 to public. Fig looks first.

Done when: a screenshot on the preview URL shows /stats/report for one week with the
header (committee name, week ending), all 13 numbered lines with values, the definitions
for lines 1, 3, 8, 9 and 13, a visible "definition missing" marker on the other 8, and
the week arrows and Download .docx button. The .docx opens in Word and matches.
```

## 2. Paste in the 8 missing report definitions

```
Blocked until Fig provides the official OTC Int wording for report lines
2, 4, 5, 6, 7, 10, 11 and 12. Do not write or guess this text.

Once Fig has sent it, and only after step 1 is merged and 0023 is applied to public:
1. On dev, paste each definition in Settings > Manage Stats and check /stats/report.
2. Fig (or Fig's go-ahead) enters the same text on production through the app. No SQL on public.

Done when: a screenshot of /stats/report on the preview URL (dev data) shows all 13
lines with definitions and no "definition missing" markers.
```

## 3. Check that dev and public schemas match

```
Repo figriver/ot-committee, Supabase project ref aduhjzhvppkzjslzovwk. READ-ONLY on both schemas.

Migrations 0001-0022 are run by hand, so `dev` and `public` can drift. Using
information_schema / pg_catalog queries only (no writes), compare the tables,
columns, indexes and RLS policies of `dev` vs `public`. Check specifically that the
0018-0022 tables and columns exist in both (checklist_items, events, general_hats,
general_hat_groups, stat detail lines). Also confirm `dev` is still listed in the API's
exposed schemas.

Write the differences into the run report. Do not fix anything; list the exact
migration file(s) Fig would need to run for each gap.

Done when: the run report has a dev-vs-public table with a match/missing line per
migration 0001-0022, and a screenshot on the production URL (read-only) shows
/events and /stats loading without errors.
```

## 4. Projects as a second checklist parent (Slice 4 start)

```
Repo figriver/ot-committee. New branch slice4-projects off main. CONFIRM scope with Fig first.

Read CHECKLIST.md ("Adding a parent type"). Add `project` as a checklist parent:
a projects table with an owner member, a delete trigger that drops its items,
a registry entry in lib/checklist-parents.ts, and a /projects list + /projects/[id]
screen that reuses components/checklist-panel.tsx. Do not create a second checklist table.
New migration 0024 (or next free number): run on `dev` only. DB_SCHEMA=dev for all testing.
npm run typecheck and npm run build must pass. Push the branch; don't merge.

Done when: a screenshot on the branch preview URL shows a project page with a checklist
of at least 3 items (one assigned, one done with who/when, one unassigned), and the
project's open items show under "my actions" for its assignee.
```

## 5. Custom stat groups: creation screen

```
Repo figriver/ot-committee. New branch stat-groups-ui off main. CONFIRM Fig still wants this.

lib/groups.ts already resolves custom stat groups (storage from migration 0012) but there
is no screen to create them. Add an admin-only screen under Settings to create, rename,
reorder and delete a custom group and choose its stats, using the design tokens in
DESIGN.md. No schema change expected; if one is needed, stop and ask.
DB_SCHEMA=dev for all testing; npm run typecheck and npm run build must pass. Push; don't merge.

Done when: a screenshot on the branch preview URL shows a new custom group created in
Settings and that group appearing on the committee stats dashboard with its stats.
```
