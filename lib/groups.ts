import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// Slice 2e — the GROUP abstraction behind the committee dashboard.
//
// A group is deliberately abstract: a name, an ordered set of stats, and a
// SOURCE that says where the grouping came from. Nothing downstream (the page,
// the grid, the cards) knows or cares which source produced a group — they all
// receive the same `StatGroup` shape.
//
//   'org'    — generated from org structure, one group per division or per
//              department. DERIVED at read time from posts/departments/
//              divisions, never stored, so it cannot drift from the board:
//              move a post to another department and its stat moves group.
//   'custom' — a user-made group over an arbitrary set of stats, stored in
//              stat_groups / stat_group_stats (migration 0012). The resolver is
//              live; the creation UI is a later slice, so today it simply finds
//              no rows and contributes no groups.
//
// ADDING A NEW KIND OF GROUPING = write a resolver and register it in RESOLVERS.
// No page, component, or CSS change. That is the whole point of the indirection:
// org grouping is the first instance of the mechanism, not the mechanism itself.

export type GroupSource = 'org' | 'custom';

/** How org groups are cut. Both are the SAME resolver, one parameter apart. */
export type OrgGrain = 'division' | 'department';

export type GroupedStat = {
  id: string;
  name: string;
  postId: string;
  postTitle: string;
  contextLabel: string; // where the stat sits, for the card subtitle
};

export type StatGroup = {
  key: string; // stable id for anchors / collapse state
  name: string; // "Division 4 — Production"
  subtitle: string | null;
  source: GroupSource;
  stats: GroupedStat[];
};

type ResolverCtx = { grain: OrgGrain };
type GroupResolver = (ctx: ResolverCtx) => Promise<StatGroup[]>;

// ---------------------------------------------------------------------------
// Shared raw read: every active stat with the org context of the post it sits on
// ---------------------------------------------------------------------------

type StatRow = {
  id: string;
  name: string;
  postId: string;
  postTitle: string;
  divisionId: string | null;
  divisionNumber: number | null;
  divisionName: string | null;
  divisionSort: number;
  departmentId: string | null;
  departmentName: string | null;
  departmentSort: number;
  postSort: number;
  createdAt: string;
};

async function readStats(): Promise<StatRow[]> {
  const supa = getServiceClient();
  const [statRes, postRes, deptRes, divRes] = await Promise.all([
    supa.from('stats').select('id, name, post_id, created_at').eq('active', true),
    supa.from('posts').select('id, title, department_id, division_id, sort_order'),
    supa.from('departments').select('id, name, division_id, sort_order'),
    supa.from('divisions').select('id, number, name, sort_order'),
  ]);

  const posts = new Map((postRes.data ?? []).map((p) => [p.id, p]));
  const depts = new Map((deptRes.data ?? []).map((d) => [d.id, d]));
  const divs = new Map((divRes.data ?? []).map((d) => [d.id, d]));

  return (statRes.data ?? []).map((s) => {
    const post = posts.get(s.post_id);
    // A post sits EITHER in a department or directly at division level (0008),
    // so resolve the division through whichever link exists.
    const dept = post?.department_id ? depts.get(post.department_id) : undefined;
    const divId = post?.division_id ?? dept?.division_id ?? null;
    const div = divId ? divs.get(divId) : undefined;
    return {
      id: s.id,
      name: s.name,
      postId: s.post_id,
      postTitle: post?.title ?? '(unknown post)',
      divisionId: divId,
      divisionNumber: div?.number ?? null,
      divisionName: div?.name ?? null,
      divisionSort: div?.sort_order ?? 9_999,
      departmentId: dept?.id ?? null,
      departmentName: dept?.name ?? null,
      departmentSort: dept?.sort_order ?? 9_999,
      postSort: post?.sort_order ?? 0,
      createdAt: s.created_at,
    };
  });
}

function contextLabel(s: StatRow): string {
  const where = s.departmentName ?? '(division level)';
  return `${where} — ${s.postTitle}`;
}

function toGroupedStat(s: StatRow): GroupedStat {
  return {
    id: s.id,
    name: s.name,
    postId: s.postId,
    postTitle: s.postTitle,
    contextLabel: contextLabel(s),
  };
}

// ---------------------------------------------------------------------------
// Resolver: org structure
// ---------------------------------------------------------------------------

async function resolveOrgGroups({ grain }: ResolverCtx): Promise<StatGroup[]> {
  const stats = await readStats();
  const buckets = new Map<string, { group: StatGroup; sort: number; rows: StatRow[] }>();

  for (const s of stats) {
    // Division-level posts have no department. Under department grain they would
    // otherwise vanish, so they get their own "division level" bucket rather
    // than being dropped or lumped into an unrelated department.
    const byDept = grain === 'department' && s.departmentId;
    const key = byDept
      ? `dept:${s.departmentId}`
      : grain === 'department'
        ? `divlevel:${s.divisionId ?? 'none'}`
        : `div:${s.divisionId ?? 'none'}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      const divLabel =
        s.divisionNumber != null
          ? `Division ${s.divisionNumber} — ${s.divisionName}`
          : 'Unassigned';
      const name = byDept ? (s.departmentName as string) : divLabel;
      const subtitle = byDept
        ? divLabel
        : grain === 'department'
          ? 'Posts held at division level'
          : null;
      bucket = {
        group: { key, name, subtitle, source: 'org', stats: [] },
        // Board order: division, then department, then division-level first.
        sort: s.divisionSort * 1_000 + (byDept ? s.departmentSort + 1 : 0),
        rows: [],
      };
      buckets.set(key, bucket);
    }
    bucket.rows.push(s);
  }

  return [...buckets.values()]
    .sort((a, b) => a.sort - b.sort)
    .map(({ group, rows }) => ({
      ...group,
      stats: rows
        .sort(
          (a, b) =>
            a.departmentSort - b.departmentSort ||
            a.postSort - b.postSort ||
            a.createdAt.localeCompare(b.createdAt),
        )
        .map(toGroupedStat),
    }));
}

// ---------------------------------------------------------------------------
// Resolver: custom groups (storage from 0012; creation UI is a later slice)
// ---------------------------------------------------------------------------

async function resolveCustomGroups(): Promise<StatGroup[]> {
  const supa = getServiceClient();
  const { data: groups } = await supa
    .from('stat_groups')
    .select('id, name, sort_order')
    .eq('source', 'custom')
    .order('sort_order', { ascending: true });
  if (!groups?.length) return []; // nothing created yet — the normal case today

  const { data: members } = await supa
    .from('stat_group_stats')
    .select('group_id, stat_id, sort_order')
    .in(
      'group_id',
      groups.map((g) => g.id),
    )
    .order('sort_order', { ascending: true });

  const byId = new Map((await readStats()).map((s) => [s.id, s]));
  return groups.map((g) => ({
    key: `custom:${g.id}`,
    name: g.name,
    subtitle: null,
    source: 'custom' as const,
    stats: (members ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => byId.get(m.stat_id)) // skips stats that are inactive/deleted
      .filter((s): s is StatRow => Boolean(s))
      .map(toGroupedStat),
  }));
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const RESOLVERS: Record<GroupSource, GroupResolver> = {
  org: resolveOrgGroups,
  custom: resolveCustomGroups,
};

export const GROUP_SOURCES = Object.keys(RESOLVERS) as GroupSource[];

/**
 * Every group from every registered source, in source order, with empty groups
 * dropped. The committee dashboard renders whatever comes back — it has no
 * knowledge of org structure.
 */
export async function getStatGroups(
  grain: OrgGrain = 'division',
  sources: GroupSource[] = GROUP_SOURCES,
): Promise<StatGroup[]> {
  const resolved = await Promise.all(sources.map((s) => RESOLVERS[s]({ grain })));
  return resolved.flat().filter((g) => g.stats.length > 0);
}

export function asGrain(v: unknown): OrgGrain {
  return v === 'department' ? 'department' : 'division';
}
