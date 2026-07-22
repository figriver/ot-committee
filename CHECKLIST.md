# The checklist primitive — an assignable action with a done-state

**This is not an events feature.** It is the committee's generic unit of
execution, and Events is simply the first thing to use it. Slice 4's Programs,
Projects, Orders and Compliance targets are meant to reuse it **as-is** — no
second table, no forked logic, no migration.

> One sentence: *something that has to get done, held by someone (or nobody
> yet), optionally due by a date, either done or not — and when it is done we
> know who ticked it and when.*

---

## The model

One table, `checklist_items` (migration
[`0018_checklist_items.sql`](supabase/migrations/0018_checklist_items.sql)):

| Column | Meaning |
|---|---|
| `parent_type` + `parent_id` | **what it belongs to** — a lowercase slug naming the kind of parent, plus that row's id |
| `title`, `description` | what has to be done |
| `assignee_member_id` | who has it. **NULL = Unassigned**, a real state, not missing data |
| `due_date` | optional deadline |
| `is_done`, `done_by`, `done_at` | the done-state, **with attribution** |
| `sort_order` | the order the list is worked in |
| `created_by`, `created_at`, `updated_at` | provenance |

Constraints worth knowing: `parent_type` must be a slug (`^[a-z][a-z0-9_]*$`),
a title can't be blank, and **not-done implies no done attribution** — you can
never have a row claiming someone completed something that isn't complete.

### Why polymorphic, and what it costs

An event checklist, a project's targets and an order's compliance steps are the
*same object* with the *same rules*: assign, chase, tick off, see who has what.
A child table per parent would fork that logic four ways and give every future
surface its own half-built version of "who hasn't done their bit".

The price is that Postgres can't foreign-key `parent_id`. Two things pay it back:

1. **The registry** — [`lib/checklist-parents.ts`](lib/checklist-parents.ts) —
   is the single place that knows what a parent type *is*: which table, which
   column names it, which column holds the member answerable for it, and where
   its screen lives.
2. **Each parent owns a delete-cascade trigger.** `events` drops its items in a
   `before delete` trigger (migration 0019). Orphans can't accumulate even if a
   row is deleted straight from SQL.

---

## The two rights

They are deliberately different, and both are enforced **server-side** in
[`lib/checklist.ts`](lib/checklist.ts) — the UI only hides what the server would
also refuse.

| Right | Who | Where it's decided |
|---|---|---|
| **Manage** — add, edit, reassign, remove items | an **admin**, or the **parent's owner** (an event's I/C) | `canManageChecklist()` in the registry — it depends on the parent |
| **Mark done** | the item's **assignee**; plus anyone who can manage (so an unassigned item can be ticked, and a mistake fixed) | `canMarkDone()` in `lib/checklist.ts` — it depends only on the item |

Ticking stamps `done_by` + `done_at`. Unticking clears both, so attribution is
never stale.

---

## The API

`lib/checklist.ts` owns **reads and writes both**, so every surface inherits the
same rules instead of re-deriving them:

```ts
listChecklistItems(parent, viewer, today?)   // one parent's list, hydrated
checklistProgress(type, parentIds[], today?) // {total,done,open,overdue,percent} in ONE query
myOpenChecklistItems(viewer, limit?, today?) // a member's open items ACROSS parent types

addChecklistItem(parent, viewer, input)      // manage right
updateChecklistItem(itemId, viewer, patch)   // manage right
setChecklistItemDone(itemId, viewer, done)   // assignee (or manage) — stamps who/when
deleteChecklistItem(itemId, viewer)          // manage right
```

Names come from the shared resolver (`lib/member-names.ts`), so a checklist never
shows a raw email beside a board name.

The UI is equally parent-agnostic:
[`components/checklist-panel.tsx`](components/checklist-panel.tsx) takes items, a
progress summary, the viewer's rights, the assignee options and **three bound
server actions**. It contains the word "event" nowhere. `.cl-*` in
`app/globals.css` styles the primitive, not events.

---

## Adding a parent type (what Slice 4 does)

Four steps, none of which touch the primitive:

1. **Register it** in `lib/checklist-parents.ts`:

   ```ts
   export const CHECKLIST_PARENT_TYPES = ['event', 'project'] as const;

   project: {
     noun: 'project',
     table: 'projects',
     nameColumn: 'name',
     ownerColumn: 'owner_member_id', // null ⇒ admins only
     href: (id) => `/projects/${id}`,
   },
   ```

2. **Add the delete-cascade trigger** on the new table — copy the block at the
   bottom of `0019_events.sql`, changing `'event'` to `'project'`.

3. **Bind four thin server actions** in that route's `actions.ts` (see
   `app/events/actions.ts` — each is one line plus `revalidatePath`).

4. **Render `<ChecklistPanel>`** with those actions bound to the parent id.

That's it. `myOpenChecklistItems` starts returning project items in the
"Assigned to you" panel automatically, because it queries the primitive, not
events.

---

## Events — the first application

An [event](lib/events.ts) owns only its own facts: `name`, `event_type`
(fundraiser / recruitment / Dianetics seminar / Bridge event / other),
`event_date`, `owner_member_id` (the **I/C**), `area_post_id` (the org-board
area, defaulting to Division 4's OT Events Officer post, resolved *by title*
because post ids differ per schema), and `notes`. Everything that has to get
**done** for it is checklist items with `parent_type = 'event'`.

Turnout is two headcounts on the event — `confirmed_count` and `attended_count`
— each with who recorded them and when. NULL means "not recorded", which is not
the same as a recorded zero. Per-person attendance would be a later
`event_attendees` table summing *into* these columns; nothing has to change to
add it.

**Feeding wins later:** a well-attended event is a win, and the wins feed (0015)
needs exactly a date, an area post, a body and a member — which an event already
carries. That promotion is **not** built: no trigger, no auto-created win. It
stays a deliberate human act until the committee asks for it.
