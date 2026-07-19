import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import type {
  Division,
  Department,
  Section,
  Post,
  Holder,
  DivisionFull,
  DepartmentFull,
  PostWithHolders,
} from '@/lib/types';

export async function getDivisions(): Promise<Division[]> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('divisions')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`getDivisions: ${error.message}`);
  return (data ?? []) as Division[];
}

/**
 * Fetch one division (by its division number) with its full tree:
 * departments -> sections -> posts -> holders, and department-level posts.
 * Fetched flat and assembled in JS so ordering is deterministic at every level.
 */
export async function getDivisionByNumber(
  divisionNumber: number,
): Promise<DivisionFull | null> {
  const supa = getServiceClient();

  const { data: divisionRow, error: divErr } = await supa
    .from('divisions')
    .select('*')
    .eq('number', divisionNumber)
    .maybeSingle();
  if (divErr) throw new Error(`getDivisionByNumber: ${divErr.message}`);
  if (!divisionRow) return null;
  const division = divisionRow as Division;

  const { data: deptRows, error: deptErr } = await supa
    .from('departments')
    .select('*')
    .eq('division_id', division.id)
    .order('sort_order', { ascending: true });
  if (deptErr) throw new Error(`getDivisionByNumber(departments): ${deptErr.message}`);
  const departments = (deptRows ?? []) as Department[];
  const deptIds = departments.map((d) => d.id);

  let sections: Section[] = [];
  let posts: Post[] = [];
  if (deptIds.length > 0) {
    const [{ data: secRows, error: secErr }, { data: postRows, error: postErr }] =
      await Promise.all([
        supa
          .from('sections')
          .select('*')
          .in('department_id', deptIds)
          .order('sort_order', { ascending: true }),
        supa
          .from('posts')
          .select('*')
          .in('department_id', deptIds)
          .order('sort_order', { ascending: true }),
      ]);
    if (secErr) throw new Error(`getDivisionByNumber(sections): ${secErr.message}`);
    if (postErr) throw new Error(`getDivisionByNumber(posts): ${postErr.message}`);
    sections = (secRows ?? []) as Section[];
    posts = (postRows ?? []) as Post[];
  }

  const postIds = posts.map((p) => p.id);
  let holders: Holder[] = [];
  if (postIds.length > 0) {
    const { data: holderRows, error: holderErr } = await supa
      .from('post_holders')
      .select('*')
      .in('post_id', postIds)
      .order('sort_order', { ascending: true });
    if (holderErr) throw new Error(`getDivisionByNumber(holders): ${holderErr.message}`);
    holders = (holderRows ?? []) as Holder[];
  }

  // Assemble
  const holdersByPost = new Map<string, Holder[]>();
  for (const h of holders) {
    const list = holdersByPost.get(h.post_id) ?? [];
    list.push(h);
    holdersByPost.set(h.post_id, list);
  }
  const postsWithHolders: PostWithHolders[] = posts.map((p) => ({
    ...p,
    holders: holdersByPost.get(p.id) ?? [],
  }));

  const departmentsFull: DepartmentFull[] = departments.map((dept) => {
    const deptSections = sections
      .filter((s) => s.department_id === dept.id)
      .map((s) => ({
        ...s,
        posts: postsWithHolders.filter((p) => p.section_id === s.id),
      }));
    const deptDirectPosts = postsWithHolders.filter(
      (p) => p.department_id === dept.id && p.section_id === null,
    );
    return { ...dept, sections: deptSections, posts: deptDirectPosts };
  });

  return { ...division, departments: departmentsFull };
}
