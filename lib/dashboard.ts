import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { getPostsForPicker } from '@/lib/stats';
import { getSeries, type Scale, type SeriesView } from '@/lib/series';
import type { SubjectType } from '@/lib/history';
import type { Member } from '@/lib/types';

// Slice 2d — the member's personal dashboard.
//
// One view of everything the logged-in member is accountable for: their Hours,
// plus every active named stat on the post(s) they currently hold. Each card is
// the SAME 2c chart used on the history page, over the same entries.
//
// The set of graphs is DERIVED from post_holders, never stored. Stats live on
// posts (2a model), so when a post changes hands the stat moves with the post:
// it leaves the old holder's dashboard and appears on the new holder's, with its
// history intact. Nothing to migrate when the board is reorganised.
//
// PERSONAL ONLY (2e adds committee-wide views): the member id comes from the
// session, never from a URL, and stats are filtered to posts that member holds.
// So there is no parameter here that could be tampered with to see someone
// else's numbers.

export type DashboardCard = {
  key: string;
  subjectType: SubjectType;
  subjectId: string;
  title: string;
  subtitle: string | null;
  unit: string;
  historyHref: string;
  series: SeriesView;
};

export type DashboardView = {
  cards: DashboardCard[];
  postCount: number; // posts the member holds
  statCount: number; // named stats across those posts
};

/**
 * Every graph for `member`, at `scale`. Card 0 is always their Hours — a member
 * always has hours to report, even holding no post, so the dashboard is never
 * empty.
 */
export async function getMyDashboard(
  member: Member,
  scale: Scale,
): Promise<DashboardView> {
  const supa = getServiceClient();

  const { data: holders } = await supa
    .from('post_holders')
    .select('post_id')
    .eq('member_id', member.id);
  const postIds = [...new Set((holders ?? []).map((h) => h.post_id))];

  // Only ACTIVE stats: a retired stat keeps its history (reachable from the
  // history page) but stops occupying a card on the dashboard.
  const stats = postIds.length
    ? (
        await supa
          .from('stats')
          .select('id, name, post_id')
          .in('post_id', postIds)
          .eq('active', true)
          .order('created_at', { ascending: true })
      ).data ?? []
    : [];

  const labels = new Map((await getPostsForPicker()).map((p) => [p.id, p]));

  // Board order (division → department → post), then creation order within a post.
  const ordered = stats
    .map((s, i) => ({ ...s, _sort: (labels.get(s.post_id)?.sortKey ?? 0) * 1000 + i }))
    .sort((a, b) => a._sort - b._sort);

  // The member can always correct their own hours; canSetRollup is a stat-only
  // concern and getSeries already gates it on subjectType.
  const hoursSeries = await getSeries('hours', member.id, scale, true);

  // Each stat's series is independent — fetch them together rather than in
  // series, so N stats cost one round of queries, not N sequential ones.
  const statSeries = await Promise.all(
    ordered.map((s) => getSeries('stat', s.id, scale, true)),
  );

  const cards: DashboardCard[] = [
    {
      key: 'hours',
      subjectType: 'hours',
      subjectId: member.id,
      title: 'Hours',
      subtitle: 'Your weekly hours on post',
      unit: 'Hours',
      historyHref: `/stats/history/hours/${member.id}`,
      series: hoursSeries,
    },
    ...ordered.map((s, i) => ({
      key: s.id,
      subjectType: 'stat' as SubjectType,
      subjectId: s.id,
      title: s.name,
      subtitle: labels.get(s.post_id)?.label ?? null,
      unit: s.name,
      historyHref: `/stats/history/stat/${s.id}`,
      series: statSeries[i],
    })),
  ];

  return { cards, postCount: postIds.length, statCount: ordered.length };
}
