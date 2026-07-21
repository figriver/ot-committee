import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadAdjustable, getAdjustableWeekly } from '@/lib/adjustable';
import { currentWeekEnding, addDaysISO } from '@/lib/week';
import type { SubjectType } from '@/lib/history';
import { type Range, DEFAULT_RANGE, RANGE_WEEKS, isIsoDate } from '@/lib/range';

// The graph series for ONE stat (or one member's hours).
//
// Weekly is the native grain — it is what members actually report. Monthly and
// Quarterly are ROLLUPS of those same weekly entries, bucketed by the calendar
// period their week_ending falls in, then reduced by the stat's rollup rule
// (see 0010_stat_rollup.sql for why the rule is per-stat).
//
// A period with no underlying entries stays null — NR, not zero. The graph
// breaks the line there rather than drawing a drop to the axis, which would
// invent a collapse that never happened.
//
// No daily grain: there is no daily entry to roll up. The bucket machinery is
// keyed off `Scale`, so adding it later is a new case here, not a rewrite.

export type Scale = 'weekly' | 'monthly' | 'quarterly';
export type Rollup = 'sum' | 'average' | 'last';

export const SCALES: Scale[] = ['weekly', 'monthly', 'quarterly'];
export const ROLLUPS: Rollup[] = ['sum', 'average', 'last'];

const DAY_MS = 86400000;

export type SeriesPoint = {
  key: string;
  label: string; // full, for the tooltip
  axisLabel: string; // short, for the x-axis
  value: number | null; // null = nothing reported in this period (NR)
  start: string; // ISO — the period's first day (positions note markers)
  end: string; // ISO — the period's last day
};

export type GraphNote = { id: string; date: string; body: string };

export type SeriesView = {
  scale: Scale;
  rollup: Rollup;
  rollupNote: string; // human statement of what Monthly/Quarterly means here
  points: SeriesPoint[];
  notes: GraphNote[];
  canSetRollup: boolean;
  windowFrom: string; // ISO — first day shown (prefills the custom "from")
  windowTo: string; // ISO — last day shown (never after the current week)
};

// ---- date helpers (UTC, on plain YYYY-MM-DD strings) ------------------------

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---- bucket construction ----------------------------------------------------

/** `n` periods of `scale` ending at `endWeek` (never after it), oldest first. */
function buildBuckets(scale: Scale, endWeek: string, n: number): SeriesPoint[] {
  const latestWeek = endWeek;
  const anchor = parseISO(latestWeek);

  if (scale === 'weekly') {
    const out: SeriesPoint[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const end = addDaysISO(latestWeek, -7 * i);
      const d = parseISO(end);
      out.push({
        key: end,
        label: `Week ending ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
        axisLabel: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
        value: null,
        start: addDaysISO(end, -6),
        end,
      });
    }
    return out;
  }

  if (scale === 'monthly') {
    const out: SeriesPoint[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const y = anchor.getUTCFullYear();
      const m = anchor.getUTCMonth() - i;
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 0)); // day 0 of next month = last day
      out.push({
        key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
        label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
        axisLabel: MONTHS[start.getUTCMonth()],
        value: null,
        start: toISO(start),
        end: toISO(end),
      });
    }
    return out;
  }

  // quarterly
  const out: SeriesPoint[] = [];
  const anchorQ = Math.floor(anchor.getUTCMonth() / 3);
  for (let i = n - 1; i >= 0; i--) {
    const qAbs = anchor.getUTCFullYear() * 4 + anchorQ - i;
    const y = Math.floor(qAbs / 4);
    const q = qAbs % 4;
    const start = new Date(Date.UTC(y, q * 3, 1));
    const end = new Date(Date.UTC(y, q * 3 + 3, 0));
    out.push({
      key: `${y}-Q${q + 1}`,
      label: `Q${q + 1} ${y}`,
      axisLabel: `Q${q + 1} '${String(y).slice(2)}`,
      value: null,
      start: toISO(start),
      end: toISO(end),
    });
  }
  return out;
}

// ---- range → (endWeek, period count) ---------------------------------------

/** Largest week-ending ≤ `dateISO` on the grid anchored at `latestWeek`. Clamps
 *  a custom "to" back onto the weekly grid and never past the current week. */
function snapEnd(dateISO: string, latestWeek: string): string {
  if (dateISO >= latestWeek) return latestWeek;
  const days = Math.round((parseISO(latestWeek).getTime() - parseISO(dateISO).getTime()) / DAY_MS);
  return addDaysISO(latestWeek, -7 * Math.ceil(days / 7));
}

/** How many `scale` periods span [fromISO, endWeek] inclusive (≥ 1, capped). */
function periodCount(scale: Scale, fromISO: string, endWeek: string): number {
  if (endWeek < fromISO) return 1;
  if (scale === 'weekly') {
    const days = Math.round((parseISO(endWeek).getTime() - parseISO(fromISO).getTime()) / DAY_MS);
    return Math.min(520, Math.max(1, Math.floor(days / 7) + 1));
  }
  const a = parseISO(fromISO);
  const b = parseISO(endWeek);
  if (scale === 'monthly') {
    const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    return Math.min(240, Math.max(1, m + 1));
  }
  const qa = a.getUTCFullYear() * 4 + Math.floor(a.getUTCMonth() / 3);
  const qb = b.getUTCFullYear() * 4 + Math.floor(b.getUTCMonth() / 3);
  return Math.min(120, Math.max(1, qb - qa + 1));
}

/** Resolve a Range (+ optional custom from/to) into a concrete bucket window.
 *  `to` is always clamped to `latestWeek` — the chart never renders the future. */
function resolveWindow(
  scale: Scale,
  range: Range,
  fromParam: string | undefined,
  toParam: string | undefined,
  latestWeek: string,
  earliestWeek: string | null,
): { endWeek: string; n: number } {
  let toISO = latestWeek;
  let fromISO: string;
  if (range === 'custom') {
    toISO = isIsoDate(toParam) && toParam <= latestWeek ? toParam : latestWeek;
    fromISO =
      isIsoDate(fromParam) && fromParam <= toISO
        ? fromParam
        : addDaysISO(toISO, -RANGE_WEEKS['6m'] * 7);
  } else if (range === 'all') {
    fromISO = earliestWeek && earliestWeek < latestWeek
      ? earliestWeek
      : addDaysISO(latestWeek, -RANGE_WEEKS['1y'] * 7);
  } else {
    fromISO = addDaysISO(latestWeek, -RANGE_WEEKS[range] * 7);
  }
  const endWeek = snapEnd(toISO, latestWeek);
  return { endWeek, n: periodCount(scale, fromISO, endWeek) };
}

/** Earliest reported week for a subject (for the "All" range). Null if none. */
async function earliestWeekFor(subjectType: SubjectType, subjectId: string): Promise<string | null> {
  const supa = getServiceClient();
  if (subjectType === 'hours') {
    const { data } = await supa
      .from('member_hours')
      .select('week_ending')
      .eq('member_id', subjectId)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.week_ending ?? null;
  }
  // A plain stat: its own entries. An adjustable stat's base tracks member_hours,
  // so fall back to the earliest hours week when it has no direct entries.
  const [entry, adj] = await Promise.all([
    supa
      .from('stat_entries')
      .select('week_ending')
      .eq('stat_id', subjectId)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle(),
    (await loadAdjustable([subjectId])).get(subjectId),
  ]);
  if (entry.data?.week_ending) return entry.data.week_ending;
  if (adj) {
    const { data } = await supa
      .from('member_hours')
      .select('week_ending')
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.week_ending ?? null;
  }
  return null;
}

/** Earliest reported week across a set of stats (batch "All"). */
async function earliestWeekForStats(statIds: string[], hasAdjustable: boolean): Promise<string | null> {
  const supa = getServiceClient();
  const queries = [
    supa
      .from('stat_entries')
      .select('week_ending')
      .in('stat_id', statIds)
      .order('week_ending', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ];
  if (hasAdjustable) {
    queries.push(
      supa
        .from('member_hours')
        .select('week_ending')
        .order('week_ending', { ascending: true })
        .limit(1)
        .maybeSingle() as never,
    );
  }
  const results = await Promise.all(queries);
  const weeks = results.map((r) => r.data?.week_ending).filter(Boolean) as string[];
  return weeks.length ? weeks.sort()[0] : null;
}

function reduce(values: number[], rollup: Rollup): number {
  if (rollup === 'average') {
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }
  if (rollup === 'last') return values[values.length - 1];
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

function rollupNoteFor(scale: Scale, rollup: Rollup): string {
  if (scale === 'weekly') return 'Weekly values as reported.';
  const period = scale === 'monthly' ? 'Each month' : 'Each quarter';
  const how =
    rollup === 'sum'
      ? 'the sum of its weekly values'
      : rollup === 'average'
        ? 'the average of its weekly values'
        : 'its last reported weekly value';
  return `${period} is ${how}.`;
}

// ---- the series --------------------------------------------------------------

/**
 * Weekly values for the subject in [from, to], collapsed to ONE value per week.
 *
 * A stat can hold more than one entry for a week (a post changes hands, or is
 * double-hatted). The graph must agree with the 2b table, which shows the most
 * recently written row — so collapse the same way.
 */
async function weeklyValues(
  subjectType: SubjectType,
  subjectId: string,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const supa = getServiceClient();
  const out = new Map<string, number>();

  if (subjectType === 'hours') {
    const { data } = await supa
      .from('member_hours')
      .select('week_ending, hours')
      .eq('member_id', subjectId)
      .gte('week_ending', from)
      .lte('week_ending', to);
    for (const r of data ?? []) {
      if (r.hours != null) out.set(r.week_ending, Number(r.hours));
    }
    return out;
  }

  const { data } = await supa
    .from('stat_entries')
    .select('week_ending, value, updated_at')
    .eq('stat_id', subjectId)
    .gte('week_ending', from)
    .lte('week_ending', to)
    .order('updated_at', { ascending: true }); // later rows overwrite earlier
  for (const r of data ?? []) {
    if (r.value != null) out.set(r.week_ending, Number(r.value));
  }
  return out;
}

/**
 * Fill `points` from weekly values and package the view. Shared by the single
 * and batched paths so the bucketing rule cannot drift between the history page
 * and the dashboards.
 */
function assembleSeries(
  points: SeriesPoint[],
  weekly: Map<string, number>,
  notes: GraphNote[],
  rollup: Rollup,
  scale: Scale,
  subjectType: SubjectType,
  canEdit: boolean,
): SeriesView {
  const weeks = [...weekly.keys()].sort(); // oldest first, so 'last' means last
  for (const p of points) {
    const inBucket = weeks.filter((w) => w >= p.start && w <= p.end);
    if (inBucket.length === 0) continue; // stays null → NR, line breaks
    p.value = reduce(
      inBucket.map((w) => weekly.get(w)!),
      scale === 'weekly' ? 'last' : rollup, // weekly is native: one week, one value
    );
  }
  return {
    scale,
    rollup,
    rollupNote: rollupNoteFor(scale, rollup),
    points,
    notes,
    canSetRollup: canEdit && subjectType === 'stat',
    windowFrom: points[0]?.start ?? '',
    windowTo: points[points.length - 1]?.end ?? '',
  };
}

/**
 * Series for MANY stats at once, in a fixed number of queries rather than three
 * per stat. The committee dashboard (2e) graphs every stat on the committee, so
 * the per-stat path would be an N+1 that grows with the board.
 */
export async function getStatSeriesBatch(
  statIds: string[],
  scale: Scale,
  canEdit: boolean,
  range: Range = DEFAULT_RANGE,
  fromParam?: string,
  toParam?: string,
): Promise<Map<string, SeriesView>> {
  const out = new Map<string, SeriesView>();
  if (statIds.length === 0) return out;

  const supa = getServiceClient();
  const latestWeek = await currentWeekEnding();
  // "All" needs the earliest week across the set; other ranges don't query it.
  const adjustableSet = await loadAdjustable(statIds);
  const earliest =
    range === 'all' ? await earliestWeekForStats(statIds, adjustableSet.size > 0) : null;
  const { endWeek, n } = resolveWindow(scale, range, fromParam, toParam, latestWeek, earliest);
  const template = buildBuckets(scale, endWeek, n);
  const from = template[0].start;
  const to = template[template.length - 1].end;

  const [rollupRes, entryRes, noteRes] = await Promise.all([
    supa.from('stats').select('id, rollup').in('id', statIds),
    supa
      .from('stat_entries')
      .select('stat_id, week_ending, value, updated_at')
      .in('stat_id', statIds)
      .gte('week_ending', from)
      .lte('week_ending', to)
      .order('updated_at', { ascending: true }), // later rows overwrite earlier
    supa
      .from('stat_notes')
      .select('id, subject_id, note_date, body')
      .eq('subject_type', 'stat')
      .in('subject_id', statIds)
      .eq('show_on_graph', true)
      .gte('note_date', from)
      .lte('note_date', to)
      .order('note_date', { ascending: true }),
  ]);

  const rollupById = new Map<string, Rollup>();
  for (const r of rollupRes.data ?? []) {
    const v = r.rollup as Rollup;
    rollupById.set(r.id, ROLLUPS.includes(v) ? v : 'sum');
  }

  const weeklyById = new Map<string, Map<string, number>>();
  for (const e of entryRes.data ?? []) {
    if (e.value == null) continue;
    let m = weeklyById.get(e.stat_id);
    if (!m) weeklyById.set(e.stat_id, (m = new Map()));
    m.set(e.week_ending, Number(e.value)); // last write wins, as ordered above
  }

  // Adjustable stats don't live in stat_entries — their weekly value is
  // base+manual (lib/adjustable.ts). Compute those and use them instead, so the
  // graph and the report/history agree on the same total. (adjustableSet was
  // already loaded above for the "All" range.)
  for (const [id, stat] of adjustableSet) {
    weeklyById.set(id, await getAdjustableWeekly(stat, from, to));
  }

  const notesById = new Map<string, GraphNote[]>();
  for (const n of noteRes.data ?? []) {
    const arr = notesById.get(n.subject_id) ?? [];
    arr.push({ id: n.id, date: n.note_date, body: n.body });
    notesById.set(n.subject_id, arr);
  }

  for (const id of statIds) {
    // Each stat needs its OWN point objects — assembleSeries mutates them.
    const points = template.map((p) => ({ ...p }));
    out.set(
      id,
      assembleSeries(
        points,
        weeklyById.get(id) ?? new Map(),
        notesById.get(id) ?? [],
        rollupById.get(id) ?? 'sum',
        scale,
        'stat',
        canEdit,
      ),
    );
  }
  return out;
}

export async function getSeries(
  subjectType: SubjectType,
  subjectId: string,
  scale: Scale,
  canEdit: boolean,
  range: Range = DEFAULT_RANGE,
  fromParam?: string,
  toParam?: string,
): Promise<SeriesView> {
  const supa = getServiceClient();
  const latestWeek = await currentWeekEnding();
  const earliest = range === 'all' ? await earliestWeekFor(subjectType, subjectId) : null;
  const { endWeek, n } = resolveWindow(scale, range, fromParam, toParam, latestWeek, earliest);
  const points = buildBuckets(scale, endWeek, n);
  const from = points[0].start;
  const to = points[points.length - 1].end;

  // Hours always accumulates; a named stat carries its own rule.
  let rollup: Rollup = 'sum';
  if (subjectType === 'stat') {
    const { data } = await supa
      .from('stats')
      .select('rollup')
      .eq('id', subjectId)
      .maybeSingle();
    const r = data?.rollup as Rollup | undefined;
    if (r && ROLLUPS.includes(r)) rollup = r;
  }

  // An adjustable stat's value is base+manual (computed), not a stat_entries row.
  const adjustable =
    subjectType === 'stat' ? (await loadAdjustable([subjectId])).get(subjectId) : undefined;

  const [weekly, noteRes] = await Promise.all([
    // Pull from the first bucket's start so a month/quarter counts every week
    // whose week_ending lands inside it.
    adjustable
      ? getAdjustableWeekly(adjustable, from, to)
      : weeklyValues(subjectType, subjectId, from, to),
    supa
      .from('stat_notes')
      .select('id, note_date, body')
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .eq('show_on_graph', true)
      .gte('note_date', from)
      .lte('note_date', to)
      .order('note_date', { ascending: true }),
  ]);

  return assembleSeries(
    points,
    weekly,
    (noteRes.data ?? []).map((n) => ({
      id: n.id,
      date: n.note_date,
      body: n.body,
    })),
    rollup,
    scale,
    subjectType,
    canEdit,
  );
}

export function asScale(v: unknown): Scale {
  return SCALES.includes(v as Scale) ? (v as Scale) : 'weekly';
}
