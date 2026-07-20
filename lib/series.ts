import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { currentWeekEnding, addDaysISO } from '@/lib/week';
import type { SubjectType } from '@/lib/history';

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

/** How many periods each scale shows. */
const WINDOW: Record<Scale, number> = { weekly: 26, monthly: 12, quarterly: 8 };

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

/** The `WINDOW[scale]` periods ending at the current week, oldest first. */
function buildBuckets(scale: Scale, latestWeek: string): SeriesPoint[] {
  const n = WINDOW[scale];
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
): Promise<Map<string, SeriesView>> {
  const out = new Map<string, SeriesView>();
  if (statIds.length === 0) return out;

  const supa = getServiceClient();
  const latestWeek = await currentWeekEnding();
  const template = buildBuckets(scale, latestWeek);
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
): Promise<SeriesView> {
  const supa = getServiceClient();
  const latestWeek = await currentWeekEnding();
  const points = buildBuckets(scale, latestWeek);
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

  const [weekly, noteRes] = await Promise.all([
    // Pull from the first bucket's start so a month/quarter counts every week
    // whose week_ending lands inside it.
    weeklyValues(subjectType, subjectId, from, to),
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
