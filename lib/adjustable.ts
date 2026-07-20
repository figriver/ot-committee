import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// The ADJUSTABLE-STAT type.
//
// An adjustable stat's weekly value = a SYSTEM-COMPUTED base + a MANUAL
// adjustment that requires a note. The manual side lives in stat_adjustments
// (migration 0014); the base is computed live from other tables so it is never
// stale. Adjustable stats do NOT use stat_entries — their series is base+manual,
// and putting a value in stat_entries too would double-count.
//
//   base_kind = 'hours_sum'      base = sum of member_hours that week
//   base_kind = 'active_members' base = # members who reported hours that week
//   base_kind = 'none'           base = 0 (Target Dones, until Programs exists)
//
// The manual contribution to the total is always `manual_amount`. For Active
// Members going forward the manual part is "named people not in the system", so
// the caller sets manual_amount = the count of distinct names and stores the
// names in names_json for reconciliation; historically we only had a number, so
// manual_amount holds it directly and names_json is null.

export type BaseKind = 'none' | 'hours_sum' | 'active_members';

export type AdjustableStat = {
  id: string;
  name: string;
  baseKind: BaseKind;
};

export type WeekBreakdown = {
  base: number;
  manual: number;
  total: number;
  note: string | null;
  names: string[] | null;
  hasManual: boolean;
};

/** The base value for one base_kind across a window, one query per kind. */
async function baseByWeek(
  baseKind: BaseKind,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (baseKind === 'none') return out;

  const supa = getServiceClient();
  const { data } = await supa
    .from('member_hours')
    .select('member_id, week_ending, hours')
    .gte('week_ending', from)
    .lte('week_ending', to);

  for (const r of data ?? []) {
    if (r.hours == null) continue;
    const cur = out.get(r.week_ending) ?? 0;
    // hours_sum accumulates the hours; active_members counts the reporters.
    out.set(r.week_ending, cur + (baseKind === 'hours_sum' ? Number(r.hours) : 1));
  }
  return out;
}

/** Parse a names_json array safely; a bad value degrades to no names. */
function parseNames(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
}

/**
 * base + manual per week for one adjustable stat, over [from, to]. A week with
 * NEITHER a base nor a manual row is absent from the map (NR — the graph breaks
 * the line there), exactly like a plain stat with no entry.
 */
export async function getAdjustableWeekly(
  stat: AdjustableStat,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const supa = getServiceClient();
  const [base, adjRes] = await Promise.all([
    baseByWeek(stat.baseKind, from, to),
    supa
      .from('stat_adjustments')
      .select('week_ending, manual_amount')
      .eq('stat_id', stat.id)
      .gte('week_ending', from)
      .lte('week_ending', to),
  ]);

  const manual = new Map<string, number>();
  for (const r of adjRes.data ?? []) manual.set(r.week_ending, Number(r.manual_amount));

  const out = new Map<string, number>();
  for (const w of new Set([...base.keys(), ...manual.keys()])) {
    out.set(w, (base.get(w) ?? 0) + (manual.get(w) ?? 0));
  }
  return out;
}

/** The full base/manual/total breakdown for one adjustable stat + week. */
export async function getWeekBreakdown(
  stat: AdjustableStat,
  weekEnding: string,
): Promise<WeekBreakdown> {
  const base = (await baseByWeek(stat.baseKind, weekEnding, weekEnding)).get(weekEnding) ?? 0;
  const supa = getServiceClient();
  const { data } = await supa
    .from('stat_adjustments')
    .select('manual_amount, note, names_json')
    .eq('stat_id', stat.id)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  const manual = data ? Number(data.manual_amount) : 0;
  return {
    base,
    manual,
    total: base + manual,
    note: data?.note ?? null,
    names: parseNames(data?.names_json ?? null),
    hasManual: Boolean(data),
  };
}

/** Load the adjustable stats among a set of ids (for the series/report paths). */
export async function loadAdjustable(statIds: string[]): Promise<Map<string, AdjustableStat>> {
  const out = new Map<string, AdjustableStat>();
  if (statIds.length === 0) return out;
  const supa = getServiceClient();
  const { data } = await supa
    .from('stats')
    .select('id, name, is_adjustable, base_kind')
    .in('id', statIds)
    .eq('is_adjustable', true);
  for (const s of data ?? []) {
    out.set(s.id, { id: s.id, name: s.name, baseKind: (s.base_kind as BaseKind) ?? 'none' });
  }
  return out;
}
