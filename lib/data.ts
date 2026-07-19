import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { EXEC_SIDES, sideForExecTitle } from '@/lib/board-config';
import type {
  Division,
  Department,
  Section,
  Post,
  Holder,
  DivisionFull,
  DepartmentFull,
  PostWithHolders,
  ExecPost,
  ExecTier,
  DivisionOverview,
  BoardOverview,
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
 * The board's executive tier. The Chairman is the exec post with no senior
 * (senior_post_id is null); the two Executive Secretaries are its reports whose
 * titles classify to a side (Communications over 1/2/7, Organization over 3/4/5/6).
 * Driven by senior_post_id so the connector hierarchy comes from the data.
 */
export async function getExecTier(): Promise<ExecTier> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('posts')
    .select('id, title, is_vacant, senior_post_id')
    .or(
      'title.ilike.%OT Committee Chairman%,title.ilike.%Executive Secretary%',
    );
  if (error) throw new Error(`getExecTier: ${error.message}`);
  const rows = (data ?? []) as (ExecPost & { senior_post_id: string | null })[];

  const chairman =
    rows.find((r) => /chairman/i.test(r.title) && r.senior_post_id === null) ??
    rows.find((r) => /chairman/i.test(r.title)) ??
    null;

  const execSecs = rows
    .filter((r) => /executive secretary/i.test(r.title))
    .map((r) => {
      const side = sideForExecTitle(r.title);
      return side
        ? {
            id: r.id,
            title: r.title,
            is_vacant: r.is_vacant,
            side,
            divisions: [...EXEC_SIDES[side].divisions],
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Communications side first (matches board order 7/1/2 then 3/4/5/6).
    .sort((a, b) => (a.side === 'comm' ? -1 : 1) - (b.side === 'comm' ? -1 : 1));

  return {
    chairman: chairman
      ? { id: chairman.id, title: chairman.title, is_vacant: chairman.is_vacant }
      : null,
    execSecs,
  };
}

/**
 * Whole-board overview: every division (in board order) with just its department
 * labels, plus the executive tier. Used to render the top-down tree on /board.
 */
export async function getBoardOverview(): Promise<BoardOverview> {
  const supa = getServiceClient();
  const [divisions, execTier] = await Promise.all([getDivisions(), getExecTier()]);

  let departments: Department[] = [];
  if (divisions.length > 0) {
    const { data, error } = await supa
      .from('departments')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`getBoardOverview(departments): ${error.message}`);
    departments = (data ?? []) as Department[];
  }

  const divisionsOverview: DivisionOverview[] = divisions.map((d) => ({
    ...d,
    departments: departments
      .filter((dept) => dept.division_id === d.id)
      .map((dept) => ({
        id: dept.id,
        number: dept.number,
        name: dept.name,
        vfp: dept.vfp,
      })),
  }));

  return { divisions: divisionsOverview, exec: execTier };
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
