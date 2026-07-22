"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentMember, requireAdmin } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase/server";
import { isEventType, eventParent, type EventType } from "@/lib/events";
import { canManageChecklist } from "@/lib/checklist-parents";
import {
  addChecklistItem,
  updateChecklistItem,
  setChecklistItemDone,
  deleteChecklistItem,
  type ChecklistItemInput,
} from "@/lib/checklist";
import type { Member } from "@/lib/types";
import { deny, guard, type ActionResult } from "@/lib/action-result";

// Server actions for Events. Thin wrappers: authorize, call the lib, revalidate.
//
// PERMISSIONS (all enforced HERE, on the server — the UI only hides what it
// would also refuse):
//   create an event ................ admin (an event has no owner until it exists)
//   edit / delete an event ......... admin or the event's owner (I/C)
//   record confirms / attendance ... admin or the event's owner
//   add / edit / remove items ...... admin or the event's owner  (lib/checklist)
//   mark an item done .............. the item's ASSIGNEE, or admin/owner
//                                    (lib/checklist — the primitive's own rule)

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate(eventId?: string) {
  revalidatePath("/events");
  if (eventId) revalidatePath(`/events/${eventId}`);
}

async function member(): Promise<Member> {
  const m = await getCurrentMember();
  if (!m) redirect("/login");
  return m;
}

/** Admin, or the event's I/C. DENIES otherwise — used by every event write. */
async function requireEventManage(eventId: string): Promise<Member> {
  const m = await member();
  if (!(await canManageChecklist(eventParent(eventId), m))) {
    deny("Only an admin or the event’s I/C can change this event.");
  }
  return m;
}

function cleanDate(v: string, what: string): string {
  const s = v.trim();
  if (!ISO_DATE.test(s)) deny(`${what} needs a real date.`);
  return s;
}

export type EventInput = {
  name: string;
  type: string;
  eventDate: string;
  ownerId: string;
  areaPostId: string;
  notes: string;
};

/** Create an event. Admin only; the I/C is chosen, not assumed. */
export async function createEvent(
  input: EventInput,
): Promise<ActionResult<string>> {
  return guard(async () => {
    const admin = await requireAdmin();

    const name = input.name.trim();
    if (!name) deny("An event needs a name.");
    if (!isEventType(input.type)) deny("Pick an event type.");
    const eventDate = cleanDate(input.eventDate, "An event");

    const supa = getServiceClient();
    const { data, error } = await supa
      .from("events")
      .insert({
        name,
        event_type: input.type as EventType,
        event_date: eventDate,
        owner_member_id: input.ownerId.trim() || null,
        area_post_id: input.areaPostId.trim() || null,
        notes: input.notes.trim() || null,
        created_by: admin.id,
        updated_by: admin.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`createEvent: ${error.message}`);
    revalidate(data.id as string);
    return data.id as string;
  });
}

/** Edit an event's facts. Admin or the I/C. */
export async function updateEvent(
  eventId: string,
  input: EventInput,
): Promise<ActionResult> {
  return guard(async () => {
    const m = await requireEventManage(eventId);

    const name = input.name.trim();
    if (!name) deny("An event needs a name.");
    if (!isEventType(input.type)) deny("Pick an event type.");

    const supa = getServiceClient();
    const { error } = await supa
      .from("events")
      .update({
        name,
        event_type: input.type as EventType,
        event_date: cleanDate(input.eventDate, "An event"),
        owner_member_id: input.ownerId.trim() || null,
        area_post_id: input.areaPostId.trim() || null,
        notes: input.notes.trim() || null,
        updated_by: m.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (error) throw new Error(`updateEvent: ${error.message}`);
    revalidate(eventId);
  });
}

/**
 * Delete an event. Admin or the I/C. Its checklist items go with it — the
 * before-delete trigger from migration 0019 owns that, so no orphan can survive
 * a delete made anywhere else either.
 */
export async function deleteEvent(eventId: string): Promise<ActionResult> {
  return guard(async () => {
    await requireEventManage(eventId);
    const supa = getServiceClient();
    const { error } = await supa.from("events").delete().eq("id", eventId);
    if (error) throw new Error(`deleteEvent: ${error.message}`);
    revalidate(eventId);
  });
}

/**
 * Record confirms and/or actual attendance. Blank clears back to "not recorded"
 * (NULL), which is a different thing from a recorded zero.
 */
export async function recordAttendance(
  eventId: string,
  confirmed: string,
  attended: string,
): Promise<ActionResult> {
  return guard(async () => {
    const m = await requireEventManage(eventId);

    const num = (v: string, what: string): number | null => {
      const s = v.trim();
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0)
        deny(`${what} must be a whole number, 0 or more.`);
      return n;
    };

    const supa = getServiceClient();
    const { error } = await supa
      .from("events")
      .update({
        confirmed_count: num(confirmed, "Confirms"),
        attended_count: num(attended, "Attendance"),
        attendance_updated_by: m.id,
        attendance_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (error) throw new Error(`recordAttendance: ${error.message}`);
    revalidate(eventId);
  });
}

// ---------------------------------------------------------------------------
// Checklist — the generic primitive, applied to an event parent. These wrappers
// exist only to bind the route (revalidate) to lib/checklist.ts; a Slice 4
// project screen writes its own three-line equivalents against the same lib.
// ---------------------------------------------------------------------------

export async function addEventItem(
  eventId: string,
  input: ChecklistItemInput,
): Promise<ActionResult> {
  return guard(async () => {
    await addChecklistItem(eventParent(eventId), await member(), input);
    revalidate(eventId);
  });
}

export async function updateEventItem(
  eventId: string,
  itemId: string,
  patch: Partial<ChecklistItemInput>,
): Promise<ActionResult> {
  return guard(async () => {
    await updateChecklistItem(itemId, await member(), patch);
    revalidate(eventId);
  });
}

/** The assignee ticks their own piece. Attribution is stamped in the primitive. */
export async function setEventItemDone(
  eventId: string,
  itemId: string,
  done: boolean,
): Promise<ActionResult> {
  return guard(async () => {
    await setChecklistItemDone(itemId, await member(), done);
    revalidate(eventId);
  });
}

export async function removeEventItem(
  eventId: string,
  itemId: string,
): Promise<ActionResult> {
  return guard(async () => {
    await deleteChecklistItem(itemId, await member());
    revalidate(eventId);
  });
}
