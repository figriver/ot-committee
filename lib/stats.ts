import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

export type PostLabel = {
  id: string;
  label: string; // "Div 1 · Dept of X — Post title"
  sortKey: number;
};

export type StatWithContext = {
  id: string;
  name: string;
  active: boolean;
  postId: string;
  postLabel: string;
};

export type ReportStat = { statId: string; name: string; value: string | null };
export type ReportPost = {
  postId: string;
  title: string;
  deptName: string;
  stats: ReportStat[];
};
export type MemberReport = {
  hours: string | null;
  posts: ReportPost[]; // posts the member holds (with their active stats)
};

/** Label + stable sort order for every post (Div → Dept → Post). */
async function getPostLabels(): Promise<Map<string, PostLabel>> {
  const supa = getServiceClient();
  const [divRes, deptRes, postRes] = await Promise.all([
    supa.from('divisions').select('id, number, sort_order'),
    supa.from('departments').select('id, division_id, name, sort_order'),
    supa.from('posts').select('id, department_id, division_id, title, sort_order'),
  ]);
  const divs = divRes.data ?? [];
  const depts = deptRes.data ?? [];
  const posts = postRes.data ?? [];
  const divById = new Map(divs.map((d) => [d.id, d]));
  const deptById = new Map(depts.map((d) => [d.id, d]));

  const out = new Map<string, PostLabel>();
  for (const p of posts) {
    // Division-level head posts (Secretaries) have no department; label by division.
    if (p.division_id) {
      const div = divById.get(p.division_id);
      out.set(p.id, {
        id: p.id,
        label: `Div ${div?.number ?? '?'} · (division head) — ${p.title}`,
        sortKey: (div?.sort_order ?? 0) * 1_000_000 - 1, // just before its departments
      });
      continue;
    }
    const dept = p.department_id ? deptById.get(p.department_id) : undefined;
    const div = dept ? divById.get(dept.division_id) : undefined;
    const label = `Div ${div?.number ?? '?'} · ${dept?.name ?? '—'} — ${p.title}`;
    const sortKey =
      (div?.sort_order ?? 0) * 1_000_000 +
      (dept?.sort_order ?? 0) * 1_000 +
      (p.sort_order ?? 0);
    out.set(p.id, { id: p.id, label, sortKey });
  }
  return out;
}

/** All posts as picker options, in board order. */
export async function getPostsForPicker(): Promise<PostLabel[]> {
  const labels = await getPostLabels();
  return [...labels.values()].sort((a, b) => a.sortKey - b.sortKey);
}

/** Every stat with its post label, in board order (the master list view). */
export async function getStatsWithContext(): Promise<StatWithContext[]> {
  const supa = getServiceClient();
  const [labels, statRes] = await Promise.all([
    getPostLabels(),
    supa.from('stats').select('id, name, active, post_id').order('created_at', { ascending: true }),
  ]);
  const stats = statRes.data ?? [];
  return stats
    .map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      postId: s.post_id,
      postLabel: labels.get(s.post_id)?.label ?? '(unknown post)',
      _sort: labels.get(s.post_id)?.sortKey ?? 0,
    }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...s }) => s);
}

/**
 * A member's weekly report data: their Hours (once) + the active named stats on
 * each post they currently hold, with any already-saved value for `weekEnding`.
 */
export async function getMemberReport(
  memberId: string,
  weekEnding: string,
): Promise<MemberReport> {
  const supa = getServiceClient();

  const [holderRes, hoursRes] = await Promise.all([
    supa.from('post_holders').select('post_id').eq('member_id', memberId),
    supa
      .from('member_hours')
      .select('hours')
      .eq('member_id', memberId)
      .eq('week_ending', weekEnding)
      .maybeSingle(),
  ]);
  const postIds = [...new Set((holderRes.data ?? []).map((h) => h.post_id))];
  const hours =
    hoursRes.data && hoursRes.data.hours != null
      ? String(hoursRes.data.hours)
      : null;

  if (postIds.length === 0) return { hours, posts: [] };

  const [postRes, statRes, labels] = await Promise.all([
    supa.from('posts').select('id, title, department_id').in('id', postIds),
    supa
      .from('stats')
      .select('id, name, post_id')
      .in('post_id', postIds)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    getPostLabels(),
  ]);
  const posts = postRes.data ?? [];
  const stats = statRes.data ?? [];

  const deptIds = [...new Set(posts.map((p) => p.department_id))];
  const deptName = new Map<string, string>();
  if (deptIds.length) {
    const { data } = await supa.from('departments').select('id, name').in('id', deptIds);
    for (const d of data ?? []) deptName.set(d.id, d.name);
  }

  const statIds = stats.map((s) => s.id);
  const valueByStat = new Map<string, string>();
  if (statIds.length) {
    const { data } = await supa
      .from('stat_entries')
      .select('stat_id, value')
      .eq('member_id', memberId)
      .eq('week_ending', weekEnding)
      .in('stat_id', statIds);
    for (const e of data ?? []) {
      if (e.value != null) valueByStat.set(e.stat_id, String(e.value));
    }
  }

  const statsByPost = new Map<string, ReportStat[]>();
  for (const s of stats) {
    const arr = statsByPost.get(s.post_id) ?? [];
    arr.push({ statId: s.id, name: s.name, value: valueByStat.get(s.id) ?? null });
    statsByPost.set(s.post_id, arr);
  }

  const reportPosts: ReportPost[] = posts
    .map((p) => ({
      postId: p.id,
      title: p.title,
      deptName: deptName.get(p.department_id) ?? '',
      stats: statsByPost.get(p.id) ?? [],
      _sort: labels.get(p.id)?.sortKey ?? 0,
    }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...p }) => p);

  return { hours, posts: reportPosts };
}
