import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { getStatsWithContext } from '@/lib/stats';
import { loadAdjustable, getAdjustableWeekly, type BaseKind } from '@/lib/adjustable';

// Data layer for the admin BULK STATS GRID (rows = stats, columns = recent
// weeks). It only READS here; every write goes back through correctValue (plain
// stats) or saveAdjustment (adjustable), so the grid can never bypass the
// validated paths — NR-vs-0, lock/override + updated_by, and the adjustable
// required-note rule all stay intact.
//
// The value shown per (stat, week) is the SAME single value correctValue edits:
// the most-recently-updated stat_entries row for that stat+week (matching the
// History table's one-value-per-week model). A week with no row is NR (null).

export type BulkRow = {
  statId: string;
  name: string;
  context: string; // board label: "Div 1 · Dept — Post"
  isAdjustable: boolean;
  baseKind: BaseKind | null;
  // week-ending → value. null = NR (not reported). For adjustable stats this is
  // the computed base+manual total and the cell is read-only (edited on its card).
  values: Record<string, number | null>;
};

export async function getBulkGrid(weeks: string[]): Promise<BulkRow[]> {
  const stats = (await getStatsWithContext()).filter((s) => s.active);
  const ids = stats.map((s) => s.id);
  if (ids.length === 0) return [];

  const sorted = [...weeks].sort();
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];

  const adjustable = await loadAdjustable(ids);
  const supa = getServiceClient();

  // Plain-stat values across the window; collapse to the most-recent row per
  // (stat, week) exactly as correctValue selects the row it edits.
  const { data: entries } = await supa
    .from('stat_entries')
    .select('stat_id, week_ending, value, updated_at')
    .in('stat_id', ids)
    .gte('week_ending', lo)
    .lte('week_ending', hi);

  const latest = new Map<string, { value: number | null; updatedAt: string }>();
  for (const e of entries ?? []) {
    const key = `${e.stat_id}|${e.week_ending}`;
    const prev = latest.get(key);
    if (!prev || (e.updated_at ?? '') > prev.updatedAt) {
      latest.set(key, { value: e.value == null ? null : Number(e.value), updatedAt: e.updated_at ?? '' });
    }
  }

  const rows: BulkRow[] = [];
  for (const s of stats) {
    const adj = adjustable.get(s.id);
    const values: Record<string, number | null> = {};
    if (adj) {
      const weekly = await getAdjustableWeekly(adj, lo, hi);
      for (const w of weeks) values[w] = weekly.has(w) ? (weekly.get(w) as number) : null;
    } else {
      for (const w of weeks) values[w] = latest.get(`${s.id}|${w}`)?.value ?? null;
    }
    rows.push({
      statId: s.id,
      name: s.name,
      context: s.postLabel,
      isAdjustable: Boolean(adj),
      baseKind: adj?.baseKind ?? null,
      values,
    });
  }
  return rows;
}
