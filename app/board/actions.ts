'use server';

import { revalidatePath } from 'next/cache';
import { getServiceClient } from '@/lib/supabase/server';
import type { EntityKind } from '@/lib/types';

// Which fields may be edited in place on each table (allowlist = safe).
const FIELD_ALLOW: Record<EntityKind, string[]> = {
  divisions: ['name', 'vfp', 'color'],
  departments: ['name', 'vfp'],
  sections: ['name', 'vfp'],
  posts: ['title', 'purpose', 'product', 'is_vacant'],
  post_holders: ['holder_name'],
  board_meta: ['vfp'],
};

// Nullable text fields: an empty string is stored as NULL.
const NULLABLE_TEXT = new Set(['vfp', 'purpose', 'product', 'holder_name']);

function revalidate() {
  // Revalidates /board and every nested route (e.g. /board/4).
  revalidatePath('/board', 'layout');
}

export async function updateField(
  kind: EntityKind,
  id: string,
  field: string,
  value: string | boolean,
): Promise<void> {
  if (!FIELD_ALLOW[kind]?.includes(field)) {
    throw new Error(`Field "${field}" is not editable on ${kind}.`);
  }
  const supa = getServiceClient();

  let v: string | boolean | null = value;
  if (field === 'is_vacant') {
    v = value === true || value === 'true';
  } else if (typeof value === 'string' && NULLABLE_TEXT.has(field) && value.trim() === '') {
    v = null;
  }

  const { error } = await supa.from(kind).update({ [field]: v }).eq('id', id);
  if (error) throw new Error(`updateField(${kind}.${field}): ${error.message}`);
  revalidate();
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

async function nextSortOrder(
  table: EntityKind,
  filter: Record<string, string | null>,
): Promise<number> {
  const supa = getServiceClient();
  let q = supa.from(table).select('sort_order');
  for (const [col, val] of Object.entries(filter)) {
    q = val === null ? q.is(col, null) : q.eq(col, val);
  }
  const { data, error } = await q.order('sort_order', { ascending: false }).limit(1);
  if (error) throw new Error(`nextSortOrder(${table}): ${error.message}`);
  const top = (data?.[0]?.sort_order as number | undefined) ?? 0;
  return top + 1;
}

export async function addDepartment(divisionId: string): Promise<void> {
  const supa = getServiceClient();
  // Global max department number, so a new department gets a fresh number.
  const { data: maxNumRow, error: numErr } = await supa
    .from('departments')
    .select('number')
    .order('number', { ascending: false })
    .limit(1);
  if (numErr) throw new Error(`addDepartment(number): ${numErr.message}`);
  const nextNumber = ((maxNumRow?.[0]?.number as number | undefined) ?? 0) + 1;
  const sort = await nextSortOrder('departments', { division_id: divisionId });

  const { error } = await supa.from('departments').insert({
    division_id: divisionId,
    number: nextNumber,
    name: 'New Department',
    sort_order: sort,
  });
  if (error) throw new Error(`addDepartment: ${error.message}`);
  revalidate();
}

export async function addSection(departmentId: string): Promise<void> {
  const supa = getServiceClient();
  const sort = await nextSortOrder('sections', { department_id: departmentId });
  const { error } = await supa.from('sections').insert({
    department_id: departmentId,
    name: 'New Section',
    sort_order: sort,
  });
  if (error) throw new Error(`addSection: ${error.message}`);
  revalidate();
}

export async function addPost(
  departmentId: string,
  sectionId: string | null = null,
): Promise<void> {
  const supa = getServiceClient();
  const sort = await nextSortOrder('posts', {
    department_id: departmentId,
    section_id: sectionId,
  });
  const { error } = await supa.from('posts').insert({
    department_id: departmentId,
    section_id: sectionId,
    title: 'New Post',
    is_vacant: true,
    sort_order: sort,
  });
  if (error) throw new Error(`addPost: ${error.message}`);
  revalidate();
}

/**
 * Create a new executive post directly under the OT Committee Chairman.
 * The new exec starts vacant and heads no divisions until one is assigned to it.
 */
export async function addExecutive(): Promise<void> {
  const supa = getServiceClient();

  const { data: chairRows, error: chErr } = await supa
    .from('posts')
    .select('id, department_id, senior_post_id')
    .ilike('title', '%OT Committee Chairman%');
  if (chErr) throw new Error(`addExecutive(chairman): ${chErr.message}`);
  const chair =
    (chairRows ?? []).find((r) => r.senior_post_id === null) ??
    (chairRows ?? [])[0];
  if (!chair) throw new Error('addExecutive: no OT Committee Chairman post found.');

  const sort = await nextSortOrder('posts', {
    department_id: chair.department_id,
    section_id: null,
  });
  const { error } = await supa.from('posts').insert({
    department_id: chair.department_id,
    section_id: null,
    title: 'New Executive',
    is_vacant: true,
    senior_post_id: chair.id,
    sort_order: sort,
  });
  if (error) throw new Error(`addExecutive: ${error.message}`);
  revalidate();
}

/** Point a division at the executive post it reports to (drives the board tree). */
export async function assignDivisionToExec(
  divisionId: string,
  execPostId: string,
): Promise<void> {
  const supa = getServiceClient();
  const { error } = await supa
    .from('divisions')
    .update({ head_exec_post_id: execPostId })
    .eq('id', divisionId);
  if (error) throw new Error(`assignDivisionToExec: ${error.message}`);
  revalidate();
}

export async function addHolder(postId: string): Promise<void> {
  const supa = getServiceClient();
  const sort = await nextSortOrder('post_holders', { post_id: postId });
  const { error } = await supa.from('post_holders').insert({
    post_id: postId,
    holder_name: 'New holder',
    sort_order: sort,
  });
  if (error) throw new Error(`addHolder: ${error.message}`);
  // A named holder means the post is no longer vacant.
  await supa.from('posts').update({ is_vacant: false }).eq('id', postId);
  revalidate();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRow(kind: EntityKind, id: string): Promise<void> {
  const supa = getServiceClient();
  const { error } = await supa.from(kind).delete().eq('id', id);
  if (error) throw new Error(`deleteRow(${kind}): ${error.message}`);
  revalidate();
}

// ---------------------------------------------------------------------------
// Reorder (swap sort_order with the adjacent sibling)
// ---------------------------------------------------------------------------

const SIBLING_KEY: Partial<Record<EntityKind, string[]>> = {
  departments: ['division_id'],
  sections: ['department_id'],
  posts: ['department_id', 'section_id'],
  post_holders: ['post_id'],
};

export async function moveRow(
  kind: EntityKind,
  id: string,
  direction: 'up' | 'down',
): Promise<void> {
  const keys = SIBLING_KEY[kind];
  if (!keys) throw new Error(`moveRow not supported for ${kind}.`);
  const supa = getServiceClient();

  const { data: rowData, error: rowErr } = await supa
    .from(kind)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) throw new Error(`moveRow(fetch): ${rowErr.message}`);
  if (!rowData) return;
  const row = rowData as Record<string, unknown>;

  let q = supa.from(kind).select('id, sort_order');
  for (const k of keys) {
    const val = row[k] as string | null;
    q = val === null ? q.is(k, null) : q.eq(k, val);
  }
  const { data: siblings, error: sibErr } = await q.order('sort_order', {
    ascending: true,
  });
  if (sibErr) throw new Error(`moveRow(siblings): ${sibErr.message}`);
  const list = (siblings ?? []) as { id: string; sort_order: number }[];

  const idx = list.findIndex((s) => s.id === id);
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || neighborIdx < 0 || neighborIdx >= list.length) return; // at edge

  const current = list[idx];
  const neighbor = list[neighborIdx];

  // Swap the two sort_order values.
  const { error: e1 } = await supa
    .from(kind)
    .update({ sort_order: neighbor.sort_order })
    .eq('id', current.id);
  const { error: e2 } = await supa
    .from(kind)
    .update({ sort_order: current.sort_order })
    .eq('id', neighbor.id);
  if (e1 || e2) throw new Error(`moveRow(swap): ${e1?.message ?? e2?.message}`);
  revalidate();
}
