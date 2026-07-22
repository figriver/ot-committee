import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';
import { specFor, cleanLines, HOURS_KIND, type DetailLineInput } from '@/lib/stat-details';

// Reading and writing stat detail lines. The SPEC (which fields, whether they
// are required) lives in lib/stat-details.ts; this file only moves rows.
//
// A line is addressed the way the report is: this member, this week, this stat —
// with stat_id NULL meaning the member's hours. See migration 0022 for why that
// is the key rather than stat_entries.id.

export type SavedDetailLine = {
  id: string;
  fields: Record<string, unknown>;
  sortOrder: number;
  memberId: string;
  memberName: string;
  weekEnding: string;
};

/** The detail_kind of a stat, or the hours kind for the hours subject. */
export async function detailKindOf(
  subjectType: 'stat' | 'hours',
  statId: string | null,
): Promise<string | null> {
  if (subjectType === 'hours') return HOURS_KIND;
  if (!statId) return null;
  const supa = getServiceClient();
  const { data } = await supa.from('stats').select('detail_kind').eq('id', statId).maybeSingle();
  return (data?.detail_kind as string | null) ?? null;
}

/** Detail kinds for many stats at once (the weekly report renders a page of them). */
export async function detailKinds(statIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (statIds.length === 0) return out;
  const supa = getServiceClient();
  const { data } = await supa
    .from('stats')
    .select('id, detail_kind')
    .in('id', [...new Set(statIds)]);
  for (const r of data ?? []) {
    if (r.detail_kind) out.set(r.id as string, r.detail_kind as string);
  }
  return out;
}

/** Lines for one member's entry of one stat (or their hours) in one week. */
export async function linesFor(
  statId: string | null,
  memberId: string,
  weekEnding: string,
): Promise<DetailLineInput[]> {
  const supa = getServiceClient();
  let q = supa
    .from('stat_detail_lines')
    .select('fields, sort_order')
    .eq('member_id', memberId)
    .eq('week_ending', weekEnding)
    .order('sort_order', { ascending: true });
  q = statId ? q.eq('stat_id', statId) : q.is('stat_id', null);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const f = (r.fields ?? {}) as Record<string, unknown>;
    const out: DetailLineInput = {};
    for (const [k, v] of Object.entries(f)) out[k] = v === null ? '' : String(v);
    return out;
  });
}

/**
 * Every line behind a stat (or an hours subject) across weeks — the history
 * view, attributed to whoever reported it. Bounded to the weeks on screen.
 */
export async function linesForSubject(
  subjectType: 'stat' | 'hours',
  subjectId: string,
  weekEndings: string[],
): Promise<Map<string, SavedDetailLine[]>> {
  const byWeek = new Map<string, SavedDetailLine[]>();
  if (weekEndings.length === 0) return byWeek;

  const supa = getServiceClient();
  let q = supa
    .from('stat_detail_lines')
    .select('id, fields, sort_order, member_id, week_ending')
    .in('week_ending', weekEndings)
    .order('sort_order', { ascending: true });

  // For hours the subject IS the member; for a stat it is the stat, reported by
  // possibly several members.
  q =
    subjectType === 'hours'
      ? q.eq('member_id', subjectId).is('stat_id', null)
      : q.eq('stat_id', subjectId);

  const { data } = await q;
  const rows = data ?? [];
  const names = await memberDisplayNames(rows.map((r) => r.member_id as string));

  for (const r of rows) {
    const week = r.week_ending as string;
    const list = byWeek.get(week) ?? [];
    list.push({
      id: r.id as string,
      fields: (r.fields ?? {}) as Record<string, unknown>,
      sortOrder: r.sort_order as number,
      memberId: r.member_id as string,
      memberName: names.get(r.member_id as string) ?? 'Unknown',
      weekEnding: week,
    });
    byWeek.set(week, list);
  }
  return byWeek;
}

/**
 * Replace the lines for one member/stat/week with what was submitted.
 *
 * Replace rather than merge: the form always sends the full set it is showing,
 * so a removed row must disappear. Scoped to THIS member's own lines, so two
 * members reporting the same stat never overwrite each other.
 */
export async function replaceLines(
  opts: {
    statId: string | null;
    memberId: string;
    weekEnding: string;
    kind: string;
    lines: DetailLineInput[];
    actorId: string;
  },
): Promise<void> {
  const spec = specFor(opts.kind);
  if (!spec) return;
  const clean = cleanLines(spec, opts.lines);

  const supa = getServiceClient();
  let del = supa
    .from('stat_detail_lines')
    .delete()
    .eq('member_id', opts.memberId)
    .eq('week_ending', opts.weekEnding);
  del = opts.statId ? del.eq('stat_id', opts.statId) : del.is('stat_id', null);
  await del;

  if (clean.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supa.from('stat_detail_lines').insert(
    clean.map((fields, i) => ({
      stat_id: opts.statId,
      member_id: opts.memberId,
      week_ending: opts.weekEnding,
      subject_type: opts.statId ? 'stat' : 'hours',
      fields,
      sort_order: i,
      created_by: opts.actorId,
      updated_by: opts.actorId,
      updated_at: now,
    })),
  );
  if (error) throw new Error(`replaceLines: ${error.message}`);
}
