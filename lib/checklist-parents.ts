import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import type { Member } from '@/lib/types';

// THE PARENT REGISTRY for the checklist primitive (migration 0018).
//
// `checklist_items.parent_id` is polymorphic, so Postgres can't answer "does
// this parent exist and who is answerable for it?" — this file does, in one
// table-driven place. Adding a parent type in Slice 4 (projects, programs,
// orders, compliance targets) is ONE entry here plus the delete-cascade trigger
// on that table (see 0019 for the events one). No migration, no change to
// lib/checklist.ts.
//
// It deliberately does NOT import lib/events.ts: the registry reads the parent
// table by name, so the primitive layer never depends on any application layer
// (and there is no import cycle when events.ts reads the checklist).

export const CHECKLIST_PARENT_TYPES = ['event'] as const;
// Slice 4 adds: 'project' | 'program' | 'order' | 'compliance'

export type ChecklistParentType = (typeof CHECKLIST_PARENT_TYPES)[number];

/** What a checklist belongs to: a kind plus that row's id. */
export type ChecklistParent = { type: ChecklistParentType; id: string };

type ParentSpec = {
  /** How the parent is named in UI copy and error messages. */
  noun: string;
  table: string;
  nameColumn: string;
  /**
   * The column holding the member answerable for the parent (its I/C / owner).
   * That member may manage the parent's checklist alongside admins. Null for a
   * parent type with no single owner — then only admins manage it.
   */
  ownerColumn: string | null;
  /** Where the parent's own screen lives. */
  href: (id: string) => string;
};

const REGISTRY: Record<ChecklistParentType, ParentSpec> = {
  event: {
    noun: 'event',
    table: 'events',
    nameColumn: 'name',
    ownerColumn: 'owner_member_id',
    href: (id) => `/events/${id}`,
  },
};

export function isChecklistParentType(v: unknown): v is ChecklistParentType {
  return typeof v === 'string' && (CHECKLIST_PARENT_TYPES as readonly string[]).includes(v);
}

export function parentSpec(type: ChecklistParentType): ParentSpec {
  const spec = REGISTRY[type];
  if (!spec) throw new Error(`Unknown checklist parent type: ${type}`);
  return spec;
}

/**
 * May `member` MANAGE this parent's checklist — add, edit, reassign, delete
 * items? Admins always; the parent's owner for their own parent.
 *
 * (Marking an item DONE is a different, narrower right — see canMarkDone in
 * lib/checklist.ts. That one belongs to the assignee.)
 *
 * Returns false for a parent row that doesn't exist, so a deleted parent can't
 * be written to through a stale form.
 */
export async function canManageChecklist(
  parent: ChecklistParent,
  member: Member,
): Promise<boolean> {
  const spec = parentSpec(parent.type);
  const supa = getServiceClient();
  const cols = ['id', spec.ownerColumn].filter(Boolean).join(', ');
  // The column list is built from the registry, so supabase-js can't type the
  // row shape statically — read it as a plain record.
  const { data } = await supa.from(spec.table).select(cols).eq('id', parent.id).maybeSingle();
  if (!data) return false;
  if (member.role === 'admin') return true;
  if (!spec.ownerColumn) return false;
  return (data as unknown as Record<string, unknown>)[spec.ownerColumn] === member.id;
}

/** Name + link for parents of one type — for cross-parent views ("my actions"). */
export async function describeParents(
  type: ChecklistParentType,
  ids: string[],
): Promise<Map<string, { name: string; href: string; noun: string }>> {
  const out = new Map<string, { name: string; href: string; noun: string }>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const spec = parentSpec(type);
  const supa = getServiceClient();
  const { data } = await supa
    .from(spec.table)
    .select(`id, ${spec.nameColumn}`)
    .in('id', unique);
  for (const row of data ?? []) {
    const r = row as unknown as Record<string, unknown>;
    out.set(r.id as string, {
      name: (r[spec.nameColumn] as string) ?? `(untitled ${spec.noun})`,
      href: spec.href(r.id as string),
      noun: spec.noun,
    });
  }
  return out;
}
