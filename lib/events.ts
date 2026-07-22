import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';
import { loadPostAreas, areaContext, divisionLabel } from '@/lib/area';
import {
  listChecklistItems,
  checklistProgress,
  EMPTY_PROGRESS,
  type ChecklistItem,
  type ChecklistProgress,
} from '@/lib/checklist';
import { canManageChecklist, type ChecklistParent } from '@/lib/checklist-parents';
import { EVENT_TYPES, isEventType, eventTypeLabel, type EventType } from '@/lib/event-types';
import type { Member } from '@/lib/types';

// EVENTS — the first application of the checklist primitive (lib/checklist.ts).
// Backed by migration 0019.
//
// An event owns the who/what/when/where-on-the-board; everything that has to be
// DONE for it lives in checklist_items with parent_type 'event'. That split is
// the point: Slice 4's programs and projects will own their own facts the same
// way and reuse the identical execution layer.
//
// Reads live here; writes live in app/events/actions.ts (the house pattern —
// see lib/wins.ts) except the checklist ones, which stay in the primitive.

export const EVENT_PARENT_TYPE = 'event' as const;

// The type vocabulary lives in lib/event-types.ts (no server-only) so client
// components can render the labels; re-exported here so server code has one
// import for everything Events.
export { EVENT_TYPES, isEventType, eventTypeLabel, type EventType } from '@/lib/event-types';

export function eventParent(id: string): ChecklistParent {
  return { type: EVENT_PARENT_TYPE, id };
}

export type EventSummary = {
  id: string;
  name: string;
  type: EventType;
  typeLabel: string;
  eventDate: string;
  ownerId: string | null;
  ownerName: string | null; // null = no I/C yet
  areaPostId: string | null;
  areaLabel: string;
  divisionLabel: string;
  confirmedCount: number | null;
  attendedCount: number | null;
  progress: ChecklistProgress;
  isMine: boolean; // the viewer is the I/C
};

export type EventDetail = EventSummary & {
  notes: string | null;
  items: ChecklistItem[];
  canManage: boolean; // may edit the event + manage its checklist
  createdByName: string | null;
  attendanceByName: string | null;
  attendanceAt: string | null;
};

// One literal, not a concatenation — see the note in lib/checklist.ts.
const SELECT =
  'id, name, event_type, event_date, owner_member_id, area_post_id, notes, confirmed_count, attended_count, attendance_updated_by, attendance_updated_at, created_by, created_at';

type Row = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  owner_member_id: string | null;
  area_post_id: string | null;
  notes: string | null;
  confirmed_count: number | null;
  attended_count: number | null;
  attendance_updated_by: string | null;
  attendance_updated_at: string | null;
  created_by: string | null;
};

async function hydrate(
  rows: Row[],
  viewer: Member,
  today: string,
): Promise<Map<string, EventSummary & { row: Row; names: Map<string, string> }>> {
  const [areas, names, progress] = await Promise.all([
    loadPostAreas(),
    memberDisplayNames(
      rows.flatMap((r) => [r.owner_member_id, r.created_by, r.attendance_updated_by]),
    ),
    checklistProgress(EVENT_PARENT_TYPE, rows.map((r) => r.id), today),
  ]);

  const out = new Map<string, EventSummary & { row: Row; names: Map<string, string> }>();
  for (const r of rows) {
    const a = r.area_post_id ? areas.get(r.area_post_id) : undefined;
    out.set(r.id, {
      id: r.id,
      name: r.name,
      type: (isEventType(r.event_type) ? r.event_type : 'other') as EventType,
      typeLabel: eventTypeLabel(r.event_type),
      eventDate: r.event_date,
      ownerId: r.owner_member_id,
      ownerName: r.owner_member_id ? names.get(r.owner_member_id) ?? 'Unknown' : null,
      areaPostId: r.area_post_id,
      areaLabel: r.area_post_id ? areaContext(a) : '(no area)',
      divisionLabel: divisionLabel(a),
      confirmedCount: r.confirmed_count,
      attendedCount: r.attended_count,
      progress: progress.get(r.id) ?? EMPTY_PROGRESS,
      isMine: r.owner_member_id === viewer.id,
      row: r,
      names,
    });
  }
  return out;
}

/** Events with `event_date` inside an inclusive range, soonest first. */
export async function listEvents(
  viewer: Member,
  range: { from?: string; to?: string } = {},
  today: string = new Date().toISOString().slice(0, 10),
): Promise<EventSummary[]> {
  const supa = getServiceClient();
  let q = supa.from('events').select(SELECT).order('event_date', { ascending: true }).order('created_at', { ascending: true });
  if (range.from) q = q.gte('event_date', range.from);
  if (range.to) q = q.lte('event_date', range.to);
  const { data, error } = await q;
  if (error) throw new Error(`listEvents: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const map = await hydrate(rows, viewer, today);
  return rows.map((r) => strip(map.get(r.id)!));
}

function strip(v: EventSummary & { row: Row; names: Map<string, string> }): EventSummary {
  const { row, names, ...summary } = v;
  return summary;
}

/** One event with its checklist and the viewer's rights. Null if it's gone. */
export async function getEventDetail(
  id: string,
  viewer: Member,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<EventDetail | null> {
  const supa = getServiceClient();
  const { data } = await supa.from('events').select(SELECT).eq('id', id).maybeSingle();
  if (!data) return null;

  const row = data as Row;
  const map = await hydrate([row], viewer, today);
  const base = map.get(row.id)!;
  const [items, canManage] = await Promise.all([
    listChecklistItems(eventParent(id), viewer, today),
    canManageChecklist(eventParent(id), viewer),
  ]);

  return {
    ...strip(base),
    notes: row.notes,
    items,
    canManage,
    createdByName: row.created_by ? base.names.get(row.created_by) ?? null : null,
    attendanceByName: row.attendance_updated_by
      ? base.names.get(row.attendance_updated_by) ?? null
      : null,
    attendanceAt: row.attendance_updated_at,
  };
}

/**
 * The dates carrying more than one event in a set — what the calendar highlights
 * so a clash is visible while there's still time to move something.
 */
export function conflictDates(events: { eventDate: string }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const e of events) seen.set(e.eventDate, (seen.get(e.eventDate) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([d]) => d));
}

/**
 * The default org-board area for a new event: Division 4's OT Events Officer
 * post. Resolved BY TITLE, not by a hardcoded id — the board is user-editable
 * and post ids differ between the dev and public schemas. Falls back through
 * the other Div 4 events posts, then gives up (null = "(no area)", which the
 * creator can set by hand).
 */
export async function defaultAreaPostId(): Promise<string | null> {
  const areas = await loadPostAreas();
  const div4 = [...areas.values()].filter((a) => a.divisionNumber === 4);
  const byTitle = (re: RegExp) =>
    div4.find((a) => re.test(a.postTitle))?.postId ?? null;
  return (
    byTitle(/^OT Events Officer$/i) ??
    byTitle(/OT Events/i) ??
    byTitle(/events/i) ??
    byTitle(/OT Projects Officer/i) ??
    null
  );
}
