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
  ExecPost,
  ExecTier,
  BoardMeta,
  BoardOverview,
} from '@/lib/types';

export type MemberLite = { id: string; email: string; role: string };

/** Lightweight member list for pickers (assigning holders, etc.). */
export async function getMembersLite(): Promise<MemberLite[]> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('members')
    .select('id, email, role')
    .order('email', { ascending: true });
  if (error) throw new Error(`getMembersLite: ${error.message}`);
  return (data ?? []) as MemberLite[];
}

/** The single board-level settings row (overall VFP). Null if not seeded yet. */
export async function getBoardMeta(): Promise<BoardMeta | null> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('board_meta')
    .select('id, vfp')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getBoardMeta: ${error.message}`);
  return (data as BoardMeta) ?? null;
}

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
 * The board's executive tier. The Chairman is the OT Committee Chairman post
 * with no senior (senior_post_id is null); the executives are every post that
 * reports directly to it (senior_post_id = chairman.id), in board order. Which
 * divisions each executive heads is not stored here — it lives on
 * divisions.head_exec_post_id and is fully reassignable.
 */
export async function getExecTier(): Promise<ExecTier> {
  const supa = getServiceClient();

  // Chairman: the OT Committee Chairman post (prefer the one with no senior).
  const { data: chairRows, error: chErr } = await supa
    .from('posts')
    .select('id, title, is_vacant, senior_post_id')
    .ilike('title', '%OT Committee Chairman%');
  if (chErr) throw new Error(`getExecTier(chairman): ${chErr.message}`);
  const chairRow =
    (chairRows ?? []).find((r) => r.senior_post_id === null) ??
    (chairRows ?? [])[0] ??
    null;
  if (!chairRow) return { chairman: null, execs: [] };

  // Executives: every post reporting directly to the Chairman.
  const { data: execRows, error: exErr } = await supa
    .from('posts')
    .select('id, title, is_vacant')
    .eq('senior_post_id', chairRow.id)
    .order('sort_order', { ascending: true });
  if (exErr) throw new Error(`getExecTier(execs): ${exErr.message}`);

  // Holders for the whole exec tier (chairman + reports), read from post_holders —
  // the SAME source the department post boxes use, so exec boxes aren't blank.
  const execIds = [chairRow.id, ...(execRows ?? []).map((r) => r.id)];
  const { data: holderRows, error: hErr } = await supa
    .from('post_holders')
    .select('post_id, holder_name, sort_order')
    .in('post_id', execIds)
    .order('sort_order', { ascending: true });
  if (hErr) throw new Error(`getExecTier(holders): ${hErr.message}`);
  const holderByPost = new Map<string, string>();
  for (const h of holderRows ?? []) {
    if (h.holder_name && !holderByPost.has(h.post_id)) {
      holderByPost.set(h.post_id, h.holder_name);
    }
  }

  return {
    chairman: {
      id: chairRow.id,
      title: chairRow.title,
      is_vacant: chairRow.is_vacant,
      holderName: holderByPost.get(chairRow.id) ?? null,
    },
    execs: (execRows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      is_vacant: r.is_vacant,
      holderName: holderByPost.get(r.id) ?? null,
    })) as ExecPost[],
  };
}

/**
 * Whole-board overview: every division (in board order) with just its department
 * labels, plus the executive tier. Used to render the top-down tree on /board.
 */
export async function getBoardOverview(): Promise<BoardOverview> {
  const supa = getServiceClient();
  const [divisions, execTier, meta] = await Promise.all([
    getDivisions(),
    getExecTier(),
    getBoardMeta(),
  ]);

  // Pull the whole tree flat (small board), then assemble per division. The
  // desktop layout uses only the labels; the mobile drawer uses the posts.
  let departments: Department[] = [];
  let sections: Section[] = [];
  let posts: Post[] = [];
  let holders: Holder[] = [];
  if (divisions.length > 0) {
    const [deptRes, secRes, postRes] = await Promise.all([
      supa.from('departments').select('*').order('sort_order', { ascending: true }),
      supa.from('sections').select('*').order('sort_order', { ascending: true }),
      supa.from('posts').select('*').order('sort_order', { ascending: true }),
    ]);
    if (deptRes.error) throw new Error(`getBoardOverview(departments): ${deptRes.error.message}`);
    if (secRes.error) throw new Error(`getBoardOverview(sections): ${secRes.error.message}`);
    if (postRes.error) throw new Error(`getBoardOverview(posts): ${postRes.error.message}`);
    departments = (deptRes.data ?? []) as Department[];
    sections = (secRes.data ?? []) as Section[];
    posts = (postRes.data ?? []) as Post[];

    const postIds = posts.map((p) => p.id);
    if (postIds.length > 0) {
      const { data, error } = await supa
        .from('post_holders')
        .select('*')
        .in('post_id', postIds)
        .order('sort_order', { ascending: true });
      if (error) throw new Error(`getBoardOverview(holders): ${error.message}`);
      holders = (data ?? []) as Holder[];
    }
  }

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

  const divisionsFull: DivisionFull[] = divisions.map((d) => {
    const deptRows = departments.filter((dept) => dept.division_id === d.id);
    const departmentsFull: DepartmentFull[] = deptRows.map((dept) => {
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
    return { ...d, departments: departmentsFull };
  });

  return {
    divisions: divisionsFull,
    chairman: execTier.chairman,
    execs: execTier.execs,
    meta,
  };
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
