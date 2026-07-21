import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// The org AREA of a post — the same division/department resolution the 2e stat
// groups use (lib/groups.ts), factored out so the wins by-area view groups
// consistently with the stats dashboard. A post sits EITHER in a department or
// directly at division level (migration 0008), so the division is resolved
// through whichever link exists.

export type OrgGrain = 'division' | 'department';

export type PostArea = {
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
};

/** Area info for every post, keyed by post id. */
export async function loadPostAreas(): Promise<Map<string, PostArea>> {
  const supa = getServiceClient();
  const [postRes, deptRes, divRes] = await Promise.all([
    supa.from('posts').select('id, title, department_id, division_id, sort_order'),
    supa.from('departments').select('id, name, division_id, sort_order'),
    supa.from('divisions').select('id, number, name, sort_order'),
  ]);
  const depts = new Map((deptRes.data ?? []).map((d) => [d.id, d]));
  const divs = new Map((divRes.data ?? []).map((d) => [d.id, d]));

  const out = new Map<string, PostArea>();
  for (const p of postRes.data ?? []) {
    const dept = p.department_id ? depts.get(p.department_id) : undefined;
    const divId = p.division_id ?? dept?.division_id ?? null;
    const div = divId ? divs.get(divId) : undefined;
    out.set(p.id, {
      postId: p.id,
      postTitle: p.title,
      divisionId: divId,
      divisionNumber: div?.number ?? null,
      divisionName: div?.name ?? null,
      divisionSort: div?.sort_order ?? 9_999,
      departmentId: dept?.id ?? null,
      departmentName: dept?.name ?? null,
      departmentSort: dept?.sort_order ?? 9_999,
      postSort: p.sort_order ?? 0,
    });
  }
  return out;
}

/** "Division N — Name" (or "Unassigned" when no division resolves). */
export function divisionLabel(a: PostArea | undefined): string {
  return a?.divisionNumber != null
    ? `Division ${a.divisionNumber} — ${a.divisionName}`
    : 'Unassigned';
}

/** "<dept or (division level)> — <post title>", for a subtitle/context line. */
export function areaContext(a: PostArea | undefined): string {
  if (!a) return '(unknown area)';
  const where = a.departmentName ?? '(division level)';
  return `${where} — ${a.postTitle}`;
}

/**
 * The grouping key + label for a post at a given grain, matching how 2e buckets
 * stats: by division, or by department with division-level posts in their own
 * "division level" bucket. Board order via sort keys.
 */
export function areaBucket(
  a: PostArea | undefined,
  grain: OrgGrain,
): { key: string; name: string; subtitle: string | null; sort: number } {
  const divLabel = divisionLabel(a);
  const byDept = grain === 'department' && a?.departmentId;
  if (byDept) {
    return {
      key: `dept:${a!.departmentId}`,
      name: a!.departmentName as string,
      subtitle: divLabel,
      sort: a!.divisionSort * 1_000 + a!.departmentSort + 1,
    };
  }
  if (grain === 'department') {
    return {
      key: `divlevel:${a?.divisionId ?? 'none'}`,
      name: divLabel,
      subtitle: 'Tagged at division level',
      sort: (a?.divisionSort ?? 9_999) * 1_000,
    };
  }
  return {
    key: `div:${a?.divisionId ?? 'none'}`,
    name: divLabel,
    subtitle: null,
    sort: (a?.divisionSort ?? 9_999) * 1_000,
  };
}

export function asGrain(v: unknown): OrgGrain {
  return v === 'department' ? 'department' : 'division';
}
