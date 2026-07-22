import 'server-only';
import { deny } from '@/lib/action-result';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';
import {
  canManageChecklist,
  describeParents,
  parentSpec,
  type ChecklistParent,
  type ChecklistParentType,
} from '@/lib/checklist-parents';
import type { Member } from '@/lib/types';

// THE CHECKLIST PRIMITIVE — a reusable assignable action with a done-state.
// Backed by migration 0018; the parent registry is lib/checklist-parents.ts.
// Full contract in CHECKLIST.md.
//
// An item is: something to do, on some parent, held by someone (or nobody yet),
// optionally due by a date, either done or not — and when it IS done we know who
// ticked it and when. That is the whole model, and it is the same model for an
// event's "book the speaker", a project's "get the estimate", and a compliance
// target's "send the report". Events are only the FIRST parent type.
//
// This module owns BOTH reads and writes, including permission enforcement, so
// every future surface inherits the same rules instead of re-deriving them. The
// per-route `actions.ts` files are thin 'use server' wrappers that add
// revalidatePath and nothing else.
//
// TWO RIGHTS, deliberately different:
//   MANAGE (add / edit / reassign / delete)  — admins + the parent's owner.
//     Answered by the registry, because it depends on the parent.
//   MARK DONE                                — the item's ASSIGNEE, plus anyone
//     who can manage (so an unassigned item can be ticked, and a mistake fixed).
//     Answered here, because it depends only on the item.

export type { ChecklistParent, ChecklistParentType };

// One literal, not a concatenation: supabase-js parses the select string at the
// TYPE level, and a composed string widens to `string` and breaks the inference.
const SELECT =
  'id, parent_type, parent_id, title, description, assignee_member_id, due_date, is_done, done_by, done_at, sort_order, created_at';

type Row = {
  id: string;
  parent_type: string;
  parent_id: string;
  title: string;
  description: string | null;
  assignee_member_id: string | null;
  due_date: string | null;
  is_done: boolean;
  done_by: string | null;
  done_at: string | null;
  sort_order: number;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  parentType: string;
  parentId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string | null; // null = unassigned (a real state, not missing data)
  dueDate: string | null;
  isDone: boolean;
  doneById: string | null;
  doneByName: string | null;
  doneAt: string | null;
  sortOrder: number;
  /** The viewer is the assignee. */
  isMine: boolean;
  /** The viewer may tick / untick this item (see the two rights above). */
  canMarkDone: boolean;
  /** Not done and past its due date. */
  isOverdue: boolean;
};

export type ChecklistProgress = {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** 0–100, 0 when there are no items. */
  percent: number;
};

export const EMPTY_PROGRESS: ChecklistProgress = {
  total: 0,
  done: 0,
  open: 0,
  overdue: 0,
  percent: 0,
};

export type ChecklistItemInput = {
  title: string;
  description?: string | null;
  assigneeId?: string | null; // null / '' = unassigned
  dueDate?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (!ISO_DATE.test(s)) deny('A due date must be a real date.');
  return s;
}

function cleanId(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/** May this member tick/untick this item? Pure — no I/O, so callers can reuse it. */
export function canMarkDone(
  item: { assigneeId: string | null },
  member: Member,
  canManage: boolean,
): boolean {
  return canManage || item.assigneeId === member.id;
}

function progressOf(rows: Row[], today: string): ChecklistProgress {
  const total = rows.length;
  const done = rows.filter((r) => r.is_done).length;
  const overdue = rows.filter((r) => !r.is_done && r.due_date && r.due_date < today).length;
  return {
    total,
    done,
    open: total - done,
    overdue,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every item on one parent, in working order, hydrated for the viewer. */
export async function listChecklistItems(
  parent: ChecklistParent,
  viewer: Member,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<ChecklistItem[]> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('checklist_items')
    .select(SELECT)
    .eq('parent_type', parent.type)
    .eq('parent_id', parent.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listChecklistItems: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const canManage = await canManageChecklist(parent, viewer);
  return hydrate(rows, viewer, canManage, today);
}

async function hydrate(
  rows: Row[],
  viewer: Member,
  canManage: boolean,
  today: string,
): Promise<ChecklistItem[]> {
  // One name resolution for assignees AND tickers — the shared resolver, so a
  // checklist never shows a raw email next to a board name (lib/member-names).
  const names = await memberDisplayNames(
    rows.flatMap((r) => [r.assignee_member_id, r.done_by]),
  );
  return rows.map((r) => ({
    id: r.id,
    parentType: r.parent_type,
    parentId: r.parent_id,
    title: r.title,
    description: r.description,
    assigneeId: r.assignee_member_id,
    assigneeName: r.assignee_member_id ? names.get(r.assignee_member_id) ?? 'Unknown' : null,
    dueDate: r.due_date,
    isDone: r.is_done,
    doneById: r.done_by,
    doneByName: r.done_by ? names.get(r.done_by) ?? 'Unknown' : null,
    doneAt: r.done_at,
    sortOrder: r.sort_order,
    isMine: r.assignee_member_id === viewer.id,
    canMarkDone: canMarkDone({ assigneeId: r.assignee_member_id }, viewer, canManage),
    isOverdue: !r.is_done && !!r.due_date && r.due_date < today,
  }));
}

/**
 * Progress for MANY parents at once — one query, for calendar cells and list
 * rows that each want a "3/7 done" badge without an N+1.
 */
export async function checklistProgress(
  type: ChecklistParentType,
  parentIds: string[],
  today: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, ChecklistProgress>> {
  const out = new Map<string, ChecklistProgress>();
  const unique = [...new Set(parentIds)];
  if (!unique.length) return out;

  const supa = getServiceClient();
  const { data } = await supa
    .from('checklist_items')
    .select('id, parent_id, is_done, due_date')
    .eq('parent_type', type)
    .in('parent_id', unique);

  const byParent = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }
  for (const id of unique) out.set(id, progressOf(byParent.get(id) ?? [], today));
  return out;
}

export type MyChecklistItem = ChecklistItem & {
  parentName: string;
  parentHref: string;
  parentNoun: string;
};

/**
 * A member's own open items ACROSS every parent type — the cross-cutting read
 * the primitive exists to make possible ("what do I still owe anyone?"). Today
 * every row is an event's; in Slice 4 the same call also returns project and
 * order items, with no change here.
 */
export async function myOpenChecklistItems(
  viewer: Member,
  limit = 12,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<MyChecklistItem[]> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('checklist_items')
    .select(SELECT)
    .eq('assignee_member_id', viewer.id)
    .eq('is_done', false)
    // Items with a deadline first (soonest first), then the undated ones.
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];

  // The viewer is the assignee of every row, so canMarkDone is true regardless
  // of parent-level management rights.
  const items = await hydrate(rows, viewer, false, today);

  const byType = new Map<ChecklistParentType, string[]>();
  for (const r of rows) {
    const t = r.parent_type as ChecklistParentType;
    byType.set(t, [...(byType.get(t) ?? []), r.parent_id]);
  }
  const described = new Map<string, { name: string; href: string; noun: string }>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      for (const [id, d] of await describeParents(type, ids)) described.set(id, d);
    }),
  );

  return items.map((i) => {
    const d = described.get(i.parentId);
    return {
      ...i,
      parentName: d?.name ?? '(removed)',
      parentHref: d?.href ?? '#',
      parentNoun: d?.noun ?? i.parentType,
    };
  });
}

// ---------------------------------------------------------------------------
// Writes — every one of them enforces its own permission. Server-side, always.
// ---------------------------------------------------------------------------

/** Add an item to a parent. Manage right required (admin or the parent's owner). */
export async function addChecklistItem(
  parent: ChecklistParent,
  viewer: Member,
  input: ChecklistItemInput,
): Promise<string> {
  const spec = parentSpec(parent.type);
  if (!(await canManageChecklist(parent, viewer))) {
    deny(`Only an admin or the ${spec.noun}’s owner can add checklist items.`);
  }
  const title = input.title.trim();
  if (!title) deny('A checklist item needs a title.');

  const supa = getServiceClient();
  // Append: next sort_order after the current last item.
  const { data: last } = await supa
    .from('checklist_items')
    .select('sort_order')
    .eq('parent_type', parent.type)
    .eq('parent_id', parent.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supa
    .from('checklist_items')
    .insert({
      parent_type: parent.type,
      parent_id: parent.id,
      title,
      description: (input.description ?? '').trim() || null,
      assignee_member_id: cleanId(input.assigneeId),
      due_date: cleanDate(input.dueDate),
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
      created_by: viewer.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`addChecklistItem: ${error.message}`);
  return data.id as string;
}

/** Edit an item (title / description / assignee / due date). Manage right required. */
export async function updateChecklistItem(
  itemId: string,
  viewer: Member,
  patch: Partial<ChecklistItemInput>,
): Promise<void> {
  const parent = await parentOf(itemId);
  if (!parent) return;
  const spec = parentSpec(parent.type);
  if (!(await canManageChecklist(parent, viewer))) {
    deny(`Only an admin or the ${spec.noun}’s owner can change checklist items.`);
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) deny('A checklist item needs a title.');
    fields.title = t;
  }
  if (patch.description !== undefined) {
    fields.description = (patch.description ?? '').trim() || null;
  }
  if (patch.assigneeId !== undefined) fields.assignee_member_id = cleanId(patch.assigneeId);
  if (patch.dueDate !== undefined) fields.due_date = cleanDate(patch.dueDate);

  const supa = getServiceClient();
  const { error } = await supa.from('checklist_items').update(fields).eq('id', itemId);
  if (error) throw new Error(`updateChecklistItem: ${error.message}`);
}

/**
 * Tick or untick an item. The ASSIGNEE's own right — this is the whole point of
 * the primitive: the person holding the piece marks it, and the mark records who
 * and when. Admins / the parent owner may also tick (unassigned items, fixes).
 */
export async function setChecklistItemDone(
  itemId: string,
  viewer: Member,
  done: boolean,
): Promise<void> {
  const supa = getServiceClient();
  const { data: item } = await supa
    .from('checklist_items')
    .select('id, parent_type, parent_id, assignee_member_id, is_done')
    .eq('id', itemId)
    .maybeSingle();
  if (!item) return;

  const parent: ChecklistParent = {
    type: item.parent_type as ChecklistParentType,
    id: item.parent_id as string,
  };
  const manage = await canManageChecklist(parent, viewer);
  if (!canMarkDone({ assigneeId: item.assignee_member_id as string | null }, viewer, manage)) {
    deny('Only the person this item is assigned to can mark it done.');
  }

  const { error } = await supa
    .from('checklist_items')
    .update(
      done
        ? { is_done: true, done_by: viewer.id, done_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        : // Unticking clears the attribution — a half-cleared row would claim
          // someone completed something they didn't.
          { is_done: false, done_by: null, done_at: null, updated_at: new Date().toISOString() },
    )
    .eq('id', itemId);
  if (error) throw new Error(`setChecklistItemDone: ${error.message}`);
}

/** Remove an item. Manage right required. */
export async function deleteChecklistItem(itemId: string, viewer: Member): Promise<void> {
  const parent = await parentOf(itemId);
  if (!parent) return;
  const spec = parentSpec(parent.type);
  if (!(await canManageChecklist(parent, viewer))) {
    deny(`Only an admin or the ${spec.noun}’s owner can remove checklist items.`);
  }
  const supa = getServiceClient();
  const { error } = await supa.from('checklist_items').delete().eq('id', itemId);
  if (error) throw new Error(`deleteChecklistItem: ${error.message}`);
}

async function parentOf(itemId: string): Promise<ChecklistParent | null> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('checklist_items')
    .select('parent_type, parent_id')
    .eq('id', itemId)
    .maybeSingle();
  if (!data) return null;
  return { type: data.parent_type as ChecklistParentType, id: data.parent_id as string };
}
