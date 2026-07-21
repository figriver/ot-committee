import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { currentWeekEnding, addDaysISO } from '@/lib/week';
import { loadHierarchy } from '@/lib/hierarchy';
import { getAdjustableWeekly, type BaseKind } from '@/lib/adjustable';
import type { Member } from '@/lib/types';
import { memberDisplayNames, memberDisplayName } from '@/lib/member-names';

// The history view: for one subject (a named stat, or a member's hours), the
// value of every reporting week, newest first, paginated. Weeks are GENERATED
// from the week calendar rather than read off the rows, so weeks that were never
// reported still appear (as "not reported") and can be filled in from the table.

export type SubjectType = 'stat' | 'hours';

export const PAGE_SIZE = 12; // weeks per page
const MIN_BACKFILL_WEEKS = 104; // always allow paging ~2 years back to backfill

export type HistoryRow = {
  weekEnding: string;
  value: string | null; // null = not reported
  updatedBy: string | null; // display name of whoever last wrote it
  updatedAt: string | null;
};

export type Note = {
  id: string;
  noteDate: string;
  body: string;
  showOnGraph: boolean;
  createdBy: string | null;
  createdByName: string | null;
  isMine: boolean;
};

export type HistoryView = {
  subjectType: SubjectType;
  subjectId: string;
  title: string; // e.g. the stat name, or "Hours"
  subtitle: string | null; // e.g. the post label, or the member's email
  unit: string; // column header for the value column
  canEdit: boolean;
  rows: HistoryRow[];
  notes: Note[];
  page: number;
  hasNewer: boolean;
  hasOlder: boolean;
};

/** Display name for a member id — name, else board holder name, else email. */
async function memberNames(ids: string[]): Promise<Map<string, string>> {
  return memberDisplayNames(ids);
}

/** The `PAGE_SIZE` week-endings on `page` (0 = most recent), newest first. */
async function weeksForPage(page: number): Promise<string[]> {
  const latest = await currentWeekEnding();
  const start = addDaysISO(latest, -7 * page * PAGE_SIZE);
  return Array.from({ length: PAGE_SIZE }, (_, i) => addDaysISO(start, -7 * i));
}

/**
 * Can this member CORRECT this subject?
 *  - stat  : they hold the post the stat is attached to (admins: any)
 *  - hours : they are that member (admins: any)
 * Viewing is open to every logged-in member for now — restriction comes later.
 */
export async function canEditSubject(
  member: Member,
  subjectType: SubjectType,
  subjectId: string,
): Promise<boolean> {
  if (member.role === 'admin') return true;
  if (subjectType === 'hours') return subjectId === member.id;

  // Correcting a stat follows RESPONSIBILITY, not the direct holder row: whoever
  // covers the post (their own, or an unfilled one rolling up to them) is the
  // one who can correct it. Same resolver as the report view and the dashboard.
  const supa = getServiceClient();
  const { data: stat } = await supa
    .from('stats')
    .select('post_id')
    .eq('id', subjectId)
    .maybeSingle();
  if (!stat) return false;
  const h = await loadHierarchy();
  return h.effectiveHolderOf(stat.post_id) === member.id;
}

/** Notes on a subject, newest date first. */
async function getNotes(
  subjectType: SubjectType,
  subjectId: string,
  viewerId: string,
): Promise<Note[]> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('stat_notes')
    .select('id, note_date, body, show_on_graph, created_by')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });
  const rows = data ?? [];
  const names = await memberNames(rows.map((r) => r.created_by).filter(Boolean) as string[]);
  return rows.map((r) => ({
    id: r.id,
    noteDate: r.note_date,
    body: r.body,
    showOnGraph: r.show_on_graph,
    createdBy: r.created_by,
    createdByName: r.created_by ? names.get(r.created_by) ?? null : null,
    isMine: r.created_by === viewerId,
  }));
}

/**
 * Whether there is anything older than `oldestWeek` worth paging to. Always true
 * inside the backfill window so a member can page back and fill in a missed week
 * even when no rows exist there yet.
 */
async function hasOlderThan(
  oldestWeek: string,
  earliestRowWeek: string | null,
): Promise<boolean> {
  const latest = await currentWeekEnding();
  const backfillFloor = addDaysISO(latest, -7 * MIN_BACKFILL_WEEKS);
  if (oldestWeek > backfillFloor) return true;
  return !!earliestRowWeek && earliestRowWeek < oldestWeek;
}

/** History of a named stat: one row per week, across every holder who reported it. */
/**
 * History table for an ADJUSTABLE stat: one row per week showing the base+manual
 * total, read from lib/adjustable so it matches the graph. The manual side
 * carries the note/attribution; correcting an adjustable week happens on its own
 * base+manual form, so these rows are display-only here (canEdit stays false).
 */
async function getAdjustableHistory(
  member: Member,
  stat: { id: string; name: string; post_id: string; base_kind: string },
  weeks: string[],
  page: number,
  oldest: string,
): Promise<HistoryView> {
  const supa = getServiceClient();
  const totals = await getAdjustableWeekly(
    { id: stat.id, name: stat.name, baseKind: (stat.base_kind as BaseKind) ?? 'none' },
    weeks[weeks.length - 1],
    weeks[0],
  );
  const [postRes, adjRes, earliestRes] = await Promise.all([
    supa.from('posts').select('title').eq('id', stat.post_id).maybeSingle(),
    supa
      .from('stat_adjustments')
      .select('week_ending, source, updated_by')
      .eq('stat_id', stat.id)
      .gte('week_ending', weeks[weeks.length - 1])
      .lte('week_ending', weeks[0]),
    supa
      .from('stat_adjustments')
      .select('week_ending')
      .eq('stat_id', stat.id)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const meta = new Map((adjRes.data ?? []).map((a) => [a.week_ending, a]));
  const names = await memberNames(
    (adjRes.data ?? []).map((a) => a.updated_by).filter(Boolean) as string[],
  );
  const rows: HistoryRow[] = weeks.map((w) => {
    const t = totals.get(w);
    const m = meta.get(w);
    const who = m?.source === 'import' ? 'Import' : m?.updated_by ? names.get(m.updated_by) ?? null : null;
    return {
      weekEnding: w,
      value: t != null ? String(Math.round(t * 100) / 100) : null,
      updatedBy: who,
      updatedAt: null,
    };
  });
  return {
    subjectType: 'stat',
    subjectId: stat.id,
    title: stat.name,
    subtitle: postRes.data?.title ?? null,
    unit: 'Total (base + manual)',
    canEdit: false, // corrected from the base+manual form, not the inline table
    rows,
    notes: await getNotes('stat', stat.id, member.id),
    page,
    hasNewer: page > 0,
    hasOlder: await hasOlderThan(oldest, earliestRes.data?.week_ending ?? null),
  };
}

export async function getStatHistory(
  member: Member,
  statId: string,
  page: number,
): Promise<HistoryView | null> {
  const supa = getServiceClient();
  const { data: stat } = await supa
    .from('stats')
    .select('id, name, post_id, is_adjustable, base_kind')
    .eq('id', statId)
    .maybeSingle();
  if (!stat) return null;

  const weeks = await weeksForPage(page);
  const oldest = weeks[weeks.length - 1];
  const newest = weeks[0];

  // Adjustable stats aren't in stat_entries — their per-week value is base+manual
  // (lib/adjustable.ts). Build the table from that so it agrees with the graph.
  if (stat.is_adjustable) {
    return getAdjustableHistory(member, stat, weeks, page, oldest);
  }

  const [entryRes, earliestRes, postRes, canEdit, notes] = await Promise.all([
    supa
      .from('stat_entries')
      .select('member_id, week_ending, value, updated_at, updated_by')
      .eq('stat_id', statId)
      .gte('week_ending', oldest)
      .lte('week_ending', newest)
      .order('updated_at', { ascending: true }),
    supa
      .from('stat_entries')
      .select('week_ending')
      .eq('stat_id', statId)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supa.from('posts').select('title').eq('id', stat.post_id).maybeSingle(),
    canEditSubject(member, 'stat', statId),
    getNotes('stat', statId, member.id),
  ]);

  // A stat can in principle have an entry per member per week (holders change,
  // or a post is double-hatted). The table shows ONE value per week: the most
  // recently written one. Ordering by updated_at ascending means later rows win.
  const entries = entryRes.data ?? [];
  const byWeek = new Map<string, (typeof entries)[number]>();
  for (const e of entries) byWeek.set(e.week_ending, e);

  const names = await memberNames(
    entries.flatMap((e) => [e.updated_by, e.member_id].filter(Boolean) as string[]),
  );

  const rows: HistoryRow[] = weeks.map((w) => {
    const e = byWeek.get(w);
    // Rows written before 2b have no updated_by — fall back to whose report it is.
    const who = e ? e.updated_by ?? e.member_id : null;
    return {
      weekEnding: w,
      value: e && e.value != null ? String(e.value) : null,
      updatedBy: who ? names.get(who) ?? null : null,
      updatedAt: e && e.value != null ? e.updated_at : null,
    };
  });

  return {
    subjectType: 'stat',
    subjectId: statId,
    title: stat.name,
    subtitle: postRes.data?.title ?? null,
    unit: 'Value',
    canEdit,
    rows,
    notes,
    page,
    hasNewer: page > 0,
    hasOlder: await hasOlderThan(oldest, earliestRes.data?.week_ending ?? null),
  };
}

/** History of a member's universal Hours: one row per week. */
export async function getHoursHistory(
  member: Member,
  targetMemberId: string,
  page: number,
): Promise<HistoryView | null> {
  const supa = getServiceClient();
  const { data: target } = await supa
    .from('members')
    .select('id, name, email')
    .eq('id', targetMemberId)
    .maybeSingle();
  if (!target) return null;

  const weeks = await weeksForPage(page);
  const oldest = weeks[weeks.length - 1];
  const newest = weeks[0];

  const [hoursRes, earliestRes, canEdit, notes] = await Promise.all([
    supa
      .from('member_hours')
      .select('week_ending, hours, updated_at, updated_by')
      .eq('member_id', targetMemberId)
      .gte('week_ending', oldest)
      .lte('week_ending', newest),
    supa
      .from('member_hours')
      .select('week_ending')
      .eq('member_id', targetMemberId)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle(),
    canEditSubject(member, 'hours', targetMemberId),
    getNotes('hours', targetMemberId, member.id),
  ]);

  const rows0 = hoursRes.data ?? [];
  const byWeek = new Map(rows0.map((r) => [r.week_ending, r]));
  const names = await memberNames([
    ...(rows0.map((r) => r.updated_by).filter(Boolean) as string[]),
    targetMemberId,
  ]);

  const rows: HistoryRow[] = weeks.map((w) => {
    const r = byWeek.get(w);
    // Pre-2b rows have no updated_by — the value is the member's own report.
    const who = r ? r.updated_by ?? targetMemberId : null;
    return {
      weekEnding: w,
      value: r && r.hours != null ? String(r.hours) : null,
      updatedBy: who ? names.get(who) ?? null : null,
      updatedAt: r && r.hours != null ? r.updated_at : null,
    };
  });

  const isSelf = targetMemberId === member.id;
  return {
    subjectType: 'hours',
    subjectId: targetMemberId,
    title: 'Hours',
    subtitle: isSelf
      ? 'Your weekly hours'
      : ((await memberDisplayName(targetMemberId)) ?? (target.email as string)),
    unit: 'Hours',
    canEdit,
    rows,
    notes,
    page,
    hasNewer: page > 0,
    hasOlder: await hasOlderThan(oldest, earliestRes.data?.week_ending ?? null),
  };
}
