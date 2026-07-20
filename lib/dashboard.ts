import 'server-only';
import { loadHierarchy, type Hierarchy } from '@/lib/hierarchy';
import { getSeries, getStatSeriesBatch, type Scale, type SeriesView } from '@/lib/series';
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
  branch: string; // which branch it reaches you through — the dashboard groups by this
  series: SeriesView;
};

export type DashboardView = {
  cards: DashboardCard[];
  postCount: number; // posts the member holds directly
  statCount: number; // stats they are the effective holder of
  coveredCount: number; // of those, how many come from unfilled posts they cover
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
  // EFFECTIVE holder, not direct holder: the dashboard shows what this member is
  // accountable for — their own posts plus every unfilled branch rolling up to
  // them. Same resolver as the report view and chase-up, so the three surfaces
  // can never disagree about who owes what.
  const h = await loadHierarchy();
  const mine = h.statsFor(member.id);
  const heldPosts = new Set(h.postsHeldBy(member.id));

  const hoursSeries = await getSeries('hours', member.id, scale, true);
  const statSeries = await getStatSeriesBatch(
    mine.map((s) => s.id),
    scale,
    true,
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
      branch: 'You',
      series: hoursSeries,
    },
    ...mine.flatMap((s) => {
      const sv = statSeries.get(s.id);
      if (!sv) return [];
      const post = h.posts.get(s.postId);
      // Group by the branch it comes through: a stat on a post you hold sits
      // under "Your posts"; one you cover sits under the junior branch it rolls
      // up through, which is the same grouping the report view drills into.
      const branch = post ? branchLabel(h, s.postId, heldPosts) : 'Other';
      return [
        {
          key: s.id,
          subjectType: 'stat' as SubjectType,
          subjectId: s.id,
          title: s.name,
          subtitle: post
            ? `${post.divisionNumber != null ? `Div ${post.divisionNumber} · ` : ''}${
                post.departmentName ?? '(division level)'
              } — ${post.title}`
            : null,
          unit: s.name,
          historyHref: `/stats/history/stat/${s.id}`,
          branch,
          series: sv,
        },
      ];
    }),
  ];

  return {
    cards,
    postCount: heldPosts.size,
    statCount: mine.length,
    coveredCount: mine.filter((s) => !heldPosts.has(s.postId)).length,
  };
}

/**
 * Which top-level branch a stat reaches this member through: the post they hold
 * if it is one of theirs, otherwise the highest junior below their held post
 * that still leads to it.
 */
function branchLabel(h: Hierarchy, postId: string, heldPosts: Set<string>): string {
  if (heldPosts.has(postId)) return 'Your posts';
  let cur: string | null = postId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const parent: string | null = h.parentOf(cur);
    // The child of a post you hold IS the top-level branch — the same card the
    // report view shows you.
    if (parent && heldPosts.has(parent)) return h.posts.get(cur)?.title ?? 'Covered';
    cur = parent;
  }
  return 'Covered posts';
}
