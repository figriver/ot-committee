import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy, type Hierarchy, type PostNode } from '@/lib/hierarchy';

// The JUNIOR-CARD reporting view.
//
// A member sees the branches they are effectively responsible for, one level at
// a time. At any post they hold (directly, or by roll-up) they get:
//   * that post's own stats, to enter for the week; and
//   * a card per junior post whose responsibility resolves back to THEM.
//
// The cards are the exact inverse of the roll-up: a card appears because
// effectiveHolderOf(junior) is you. Post someone to that junior and it resolves
// to them instead — the branch leaves your view and appears in theirs with no
// manual reassignment. Nothing here special-cases a level of the board, so the
// same code walks Chairman → Exec Sec → Division → Department → post.

export type JuniorCard = {
  postId: string;
  title: string;
  context: string; // where it sits on the board
  isHFA: boolean; // unfilled — you hold it by roll-up
  hasUnlinkedHolder: boolean; // a name on the board, but no member who can report
  directStats: number; // stats on the post itself
  totalStats: number; // stats at or below it
  reportedStats: number; // of totalStats, how many have a value this week
};

export type EntryStat = {
  statId: string;
  name: string;
  value: string | null;
};

export type ReportNode = {
  postId: string | null; // null = the member's root view
  hours: string | null; // the member's own hours for the week (root only)
  title: string;
  context: string | null;
  breadcrumb: { postId: string | null; title: string }[];
  ownStats: EntryStat[];
  juniors: JuniorCard[];
  /** Posts held directly — only used at the root. */
  heldPosts: { postId: string; title: string; context: string }[];
  totalBelow: number;
  reportedBelow: number;
};

function contextOf(p: PostNode): string {
  const div = p.divisionNumber != null ? `Div ${p.divisionNumber} · ${p.divisionName}` : '—';
  return p.departmentName ? `${div} · ${p.departmentName}` : `${div} · (division level)`;
}

/** Values already reported this week, for the stats we are about to render. */
async function valuesForWeek(
  statIds: string[],
  weekEnding: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (statIds.length === 0) return out;
  const supa = getServiceClient();
  const { data } = await supa
    .from('stat_entries')
    .select('stat_id, value, updated_at')
    .in('stat_id', statIds)
    .eq('week_ending', weekEnding)
    .order('updated_at', { ascending: true });
  for (const e of data ?? []) {
    if (e.value != null) out.set(e.stat_id, String(e.value));
  }
  return out;
}

function cardFor(
  h: Hierarchy,
  postId: string,
  reported: Map<string, string>,
): JuniorCard {
  const p = h.posts.get(postId)!;
  const below = h.statsBelow(postId);
  return {
    postId,
    title: p.title,
    context: contextOf(p),
    isHFA: !p.holderMemberId,
    hasUnlinkedHolder: p.hasUnlinkedHolder,
    directStats: h.statsOf(postId).length,
    totalStats: below.length,
    reportedStats: below.filter((s) => reported.has(s.id)).length,
  };
}

/**
 * The view for one member, optionally focused on one post they are responsible
 * for. Returns null when they are NOT responsible for `postId` — the branch
 * devolved to someone else, or never rolled up to them.
 */
export async function getReportView(
  memberId: string,
  weekEnding: string,
  postId?: string,
): Promise<ReportNode | null> {
  const h = await loadHierarchy();

  // Every stat this member is responsible for, so counts and values are fetched
  // once for the whole view rather than per card.
  const mine = h.statsFor(memberId);
  const reported = await valuesForWeek(
    mine.map((s) => s.id),
    weekEnding,
  );

  // Hours is per MEMBER, not per post, so it is fetched once for the root view.
  const supa = getServiceClient();
  const { data: hoursRow } = await supa
    .from('member_hours')
    .select('hours')
    .eq('member_id', memberId)
    .eq('week_ending', weekEnding)
    .maybeSingle();
  const hours = hoursRow?.hours != null ? String(hoursRow.hours) : null;

  const held = h.postsHeldBy(memberId).map((id) => {
    const p = h.posts.get(id)!;
    return { postId: id, title: p.title, context: contextOf(p) };
  });

  // ---- root: the posts they hold, plus every branch rolling up to them -------
  if (!postId) {
    // Junior cards at the root are the children of held posts that resolve back
    // to this member. Held posts themselves are listed separately.
    const juniors: JuniorCard[] = [];
    for (const hp of held) {
      for (const c of h.childrenOf(hp.postId)) {
        if (h.effectiveHolderOf(c) === memberId) juniors.push(cardFor(h, c, reported));
      }
    }
    const ownStats: EntryStat[] = held.flatMap((hp) =>
      h.statsOf(hp.postId).map((s) => ({
        statId: s.id,
        name: s.name,
        value: reported.get(s.id) ?? null,
      })),
    );
    return {
      postId: null,
      hours,
      title: 'Your posts',
      context: null,
      breadcrumb: [],
      ownStats,
      juniors,
      heldPosts: held,
      totalBelow: mine.length,
      reportedBelow: mine.filter((s) => reported.has(s.id)).length,
    };
  }

  // ---- focused on one post ---------------------------------------------------
  const node = h.posts.get(postId);
  if (!node) return null;
  // Responsibility IS the permission: you may open a post you are the effective
  // holder of, and nothing else.
  if (h.effectiveHolderOf(postId) !== memberId) return null;

  const breadcrumb: { postId: string | null; title: string }[] = [];
  let cur: string | null = h.parentOf(postId);
  const seen = new Set<string>([postId]);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    // Only walk back as far as this member's responsibility reaches.
    if (h.effectiveHolderOf(cur) !== memberId) break;
    breadcrumb.unshift({ postId: cur, title: h.posts.get(cur)!.title });
    cur = h.parentOf(cur);
  }
  breadcrumb.unshift({ postId: null, title: 'Your posts' });

  const below = h.statsBelow(postId);
  return {
    postId,
    hours,
    title: node.title,
    context: contextOf(node),
    breadcrumb,
    ownStats: h.statsOf(postId).map((s) => ({
      statId: s.id,
      name: s.name,
      value: reported.get(s.id) ?? null,
    })),
    juniors: h
      .childrenOf(postId)
      .filter((c) => h.effectiveHolderOf(c) === memberId)
      .map((c) => cardFor(h, c, reported)),
    heldPosts: [],
    totalBelow: below.length,
    reportedBelow: below.filter((s) => reported.has(s.id)).length,
  };
}

/** Stat ids this member may write — effective holder, not direct holder. */
export async function reportableStatIds(memberId: string): Promise<Set<string>> {
  const h = await loadHierarchy();
  return new Set(h.statsFor(memberId).map((s) => s.id));
}
