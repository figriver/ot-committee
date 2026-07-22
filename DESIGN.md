# Design System

The single source of truth is the **DESIGN TOKENS** block at the top of
[`app/globals.css`](app/globals.css). Everything below composes from those
tokens — no component hardcodes a color, size, or radius. This document explains
the system so every future slice inherits the same polish for free.

The bar we hold: the restraint and negative space of Linear, the data-legibility
of Stripe, the clean minimal chrome of a Vercel dashboard.

---

## The one rule that matters most: chrome vs. content color

There are **two completely separate color sets**, and they never mix.

| | Where it lives | What it is |
|---|---|---|
| **Chrome palette** | tokens in `globals.css` | Neutral surfaces/text + **one** desaturated blue accent. Every button, link, nav item, focus ring, form field, table, and status pill. |
| **Division flash colors** | `divisions.color` in the DB, applied inline only to org-board cards | The seven org-board area colors — Div1 goldenrod, Div2 navy, Div3 pink, Div4 green, Div5 grey, Div6 canary, Div7 blue. **Content**, not chrome. |

The division colors are **content that belongs to the org board**. They identify
areas on board cards and drawer tiles. They must **never** appear on a button, a
nav link, an active tab, or any app surface outside the board. The app is not a
circus of seven colors — it is a calm neutral app with a single blue accent, that
happens to render a colorful org chart.

If you ever find yourself reaching for a division color in a component, stop:
you want `--accent` (or a status color), not a flash color.

---

## Theming — light and dark are both first-class

- Colors are defined as CSS custom properties on `:root` (light) and overridden
  under `:root[data-theme='dark']`.
- The active theme is stamped on `<html>` by an **inline no-flash script** in
  `app/layout.tsx` before first paint. Default follows the OS
  (`prefers-color-scheme`); the user's explicit choice is persisted to
  `localStorage` under the key `theme`.
- The toggle is [`components/theme-toggle.tsx`](components/theme-toggle.tsx)
  (sun/moon icon), placed in the account bar and on the login screen.
- **To make anything theme-aware: use a token.** Never write a hex value in a
  component. A token already has its dark counterpart; a hex does not.

SVG data-viz is theme-aware the same way — `stat-graph.tsx` passes
`var(--graph-*)` into `stroke`/`fill`, so the "up/level" line flips to near-white
on a dark plot while red "down" segments and polarity meaning stay put.

---

## Tokens

### Color roles (semantic — each has a light and dark value)

| Token | Role |
|---|---|
| `--bg` | app background |
| `--surface` | cards, nav, inputs |
| `--surface-raised` | menus, popovers |
| `--surface-sunken` | filter bars, insets, empty-state cards |
| `--border` | hairline separators |
| `--border-strong` | input borders, dividers |
| `--heading` | page/section headings |
| `--text` | body text |
| `--muted` | secondary text |
| `--text-subtle` | captions, disabled, placeholders |
| `--accent` / `--accent-hover` | the blue — buttons, active nav, focus |
| `--accent-contrast` | text/icons **on** an accent fill |
| `--accent-subtle` | active-nav / selected background tint |
| `--accent-border` | accent hairline |
| `--link` | link text |

**Status families** — each comes as solid / `-bg` tint / `-text` / `-border`:
`--success`, `--warn`, `--danger`. Use these for pills, banners, and validation —
not the accent, and never a division color.

**Data-viz:** `--graph-rising` (up/level ink), `--graph-falling` (down = danger),
`--graph-grid`, `--graph-axis`, `--graph-dotring` (dot halo = card surface).

**Back-compat aliases** — `--panel` → `--surface`, `--ink` → `--text`,
`--line` → `--border`, `--line-strong` → `--border-strong`. These exist so the
large body of pre-existing CSS themes correctly without a rewrite. New code
should prefer the semantic names, but the aliases are load-bearing — don't remove
them.

### Spacing — a 4-based rhythm

`--space-1: 4` · `--space-2: 8` · `--space-3: 12` · `--space-4: 16` ·
`--space-5: 20` · `--space-6: 24` · `--space-8: 32` · `--space-10: 40` ·
`--space-12: 48` · `--space-16: 64` (px).

Reach for spacing before borders. Airy on desktop, one step tighter on mobile.

### Type scale

`--text-caption: 11.5` · `--text-label: 12` · `--text-body: 14` ·
`--text-card: 15` · `--text-h3: 16` · `--text-h2: 18` · `--text-h1: 22` (px).
Font is **Inter** via `next/font` (`--font-inter`), with a system fallback stack
in `--font-sans`.

### Radius

`--radius-sm: 6` (controls, chips) · `--radius: 10` (cards) ·
`--radius-lg: 14` (modals/auth) · `--radius-pill: 999` (pills, toggles).

### Elevation

`--shadow-sm`, `--shadow`, `--shadow-lg` — deliberately subtle. The house style
leans on **spacing + a hairline border**; shadow is for genuinely floating things
(menus, the auth card), not for every card.

**Border vs. shadow vs. spacing —** separate with *spacing* first. If a boundary
is still needed, use a **hairline `--border`**. Use **shadow only when an element
truly floats** above the page (popovers, modals). Avoid stacking all three.

---

## Primitives (class families in `globals.css`)

Compose screens from these rather than inventing per-screen chrome:

- **Account bar** (`.acct-*`) — top chrome: a surface bar with a single hairline
  underline (not an inverted strip), neutral text, blue accent for the admin pill
  and hover. Houses nav, identity, the theme toggle, and sign-out.
- **Cards** — `--surface` fill, `--border` hairline, `--radius`, generous padding.
- **Section headers** — `--heading` at `--text-h2`/`--text-h3`, a muted sub-line.
- **Buttons** — primary = accent fill + `--accent-contrast`; secondary = surface +
  `--border-strong`; ghost = transparent, muted, hover to `--surface-sunken`.
- **Form rows/fields** — themed inputs (surface bg, body text, muted placeholder)
  with the one shared **accent focus ring** (`:focus-visible`).
- **Tables & lists** — hairline row separators, `--muted` headers, tabular nums.
- **Sub-nav** — muted labels; the active item carries the blue accent (text +
  underline), never a division color.
- **Empty states** — a `--surface-sunken` card with muted copy and an accent link
  to the action that fills it.
- **Status pills** — the status families above (`OPEN` = success, counts to chase
  = danger, partial = warn).
- **Month calendar** (`.ec-*`) — a hairline 7-column grid on `--border`, event
  chips in `--accent-subtle`. A day with more than one event is tinted `--warn`:
  a clash is a *warning*, not decoration. On mobile the grid keeps its shape and
  the chips become dots, with the month repeated below as a list.
- **Checklist** (`.cl-*`) — the reusable assignable-action primitive
  ([CHECKLIST.md](CHECKLIST.md)), not an events widget: a done-state box that
  fills `--success`, an assignee pill (`--accent-subtle` when it's yours, a
  dashed hairline when unassigned), and `--danger` only for overdue.

---

## Adding to the app — the checklist

1. **Color?** Use a token. If none fits, add a *semantic* token (with both light
   and dark values) — never a raw hex in a component.
2. **Spacing / size / radius?** Use the scales.
3. **Is it an org-board area color?** Then it's content — it lives on a board card
   from `divisions.color`, and nowhere else.
4. **New interactive control?** It inherits the accent focus ring automatically;
   don't override the outline.
5. **Check both themes** before you're done — dark is not an afterthought.
