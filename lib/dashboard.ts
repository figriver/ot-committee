import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy, type Hierarchy } from '@/lib/hierarchy';
import { loadAdjustable, getWeekBreakdown, type BaseKind } from '@/lib/adjustable';
import { currentWeekEnding } from '@/lib/week';
import { getLockConfig, isLockedAt } from '@/lib/lock';
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

// The current-week state a card's inline "update this week" control needs.
export type CardEntry = {
  currentWeek: string; // ISO
  locked: boolean; // is the current week closed (normally false)
  isAdjustable: boolean;
  baseKind: BaseKind;
  currentValue: string | null; // plain stat / hours value this week
  base: number; // adjustable: system base for this week
  manual: number; // adjustable: manual this week
  note: string; // adjustable: current note
  names: string[]; // adjustable: current names (active_members)
};

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
  entry: CardEntry; // current-week state for the inline update control
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

  // ---- current-week state for the inline "update this week" control ----------
  const supa = getServiceClient();
  const currentWeek = await currentWeekEnding();
  const lockCfg = await getLockConfig();
  const locked = isLockedAt(currentWeek, lockCfg);
  const adjustable = await loadAdjustable(mine.map((s) => s.id));

  const [hoursNowRes, plainNowRes] = await Promise.all([
    supa
      .from('member_hours')
      .select('hours')
      .eq('member_id', member.id)
      .eq('week_ending', currentWeek)
      .maybeSingle(),
    // plain (non-adjustable) stat values for the current week, one query
    mine.length
      ? supa
          .from('stat_entries')
          .select('stat_id, value, updated_at')
          .in(
            'stat_id',
            mine.filter((s) => !adjustable.has(s.id)).map((s) => s.id),
          )
          .eq('week_ending', currentWeek)
          .order('updated_at', { ascending: true })
      : { data: [] as { stat_id: string; value: number | null }[] },
  ]);
  const plainNow = new Map<string, string>();
  for (const e of plainNowRes.data ?? []) {
    if (e.value != null) plainNow.set(e.stat_id, String(e.value));
  }
  // adjustable current-week breakdowns (few — the adjustable stats you hold)
  const adjNow = new Map<string, Awaited<ReturnType<typeof getWeekBreakdown>>>();
  for (const [id, stat] of adjustable) {
    adjNow.set(id, await getWeekBreakdown(stat, currentWeek));
  }

  const plainEntry = (subjectType: SubjectType, currentValue: string | null): CardEntry => ({
    currentWeek,
    locked,
    isAdjustable: false,
    baseKind: 'none',
    currentValue,
    base: 0,
    manual: 0,
    note: '',
    names: [],
  });

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
      entry: plainEntry(
        'hours',
        hoursNowRes.data?.hours != null ? String(hoursNowRes.data.hours) : null,
      ),
    },
    ...mine.flatMap((s) => {
      const sv = statSeries.get(s.id);
      if (!sv) return [];
      const post = h.posts.get(s.postId);
      // Group by the branch it comes through: a stat on a post you hold sits
      // under "Your posts"; one you cover sits under the junior branch it rolls
      // up through, which is the same grouping the report view drills into.
      const branch = post ? branchLabel(h, s.postId, heldPosts) : 'Other';
      const adj = adjustable.get(s.id);
      const b = adjNow.get(s.id);
      const entry: CardEntry = adj
        ? {
            currentWeek,
            locked,
            isAdjustable: true,
            baseKind: adj.baseKind,
            currentValue: b ? String(b.total) : null,
            base: b?.base ?? 0,
            manual: b?.manual ?? 0,
            note: b?.note ?? '',
            names: b?.names ?? [],
          }
        : plainEntry('stat', plainNow.get(s.id) ?? null);
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
          entry,
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
