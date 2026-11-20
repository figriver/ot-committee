# CLAUDE.md

## Project rules

Shared rules (run reports, BUILD_QUEUE, screenshots, Telegram line, backups, no merge without Fig) live in /home/claude-hal/.claude/CLAUDE.md. These are the rules specific to this repo.

- Live URL: https://ot-committee.vercel.app (Vercel project `ot-committee`). Latest production deploy is bbcaa53 (dpl_EahQeiVDgaSy338xSfZcBAWT86i5).
- Deploys: Vercel production from `main`. CONFIRM whether a push to main auto-deploys or Fig runs `vercel deploy` by hand. `vercel deploy` ships the working tree, not the last commit: run `git status --porcelain` first and keep unfinished files out (see README).
- Data: Supabase project `ot-committee` (ref `aduhjzhvppkzjslzovwk`). Schema `public` is the real committee record; schema `dev` is for testing. `DB_SCHEMA=dev` for local runs and every test; never seed, test or write to `public`. Production checks are read-only.
- Migrations are run by hand in the SQL editor (not tracked by Supabase), once per schema: apply to `dev` first, then `public` before the code that needs it ships. Code and schema ship separately; `/events` once 500'd because of this.
- Commands: `npm install`, `npm run dev` (http://localhost:3000/board), `npm run build`, `npm run typecheck`, `npm run lint`. No test suite.
- Users: the members of the CC Nashville OT Committee (CONFIRM), logging in by magic link from an allowlist (`members`); admins manage members, stats and settings. Never change a production account's role, even to test.
- Never commit or upload the import source files (`hats/`, `reference/`, spreadsheets, Word files): they hold members' names, emails and phones. Never print `.env.local` or the service-role key.
- Work on a branch; no merge to main until Fig looks.
