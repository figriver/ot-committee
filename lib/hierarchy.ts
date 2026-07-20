import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// THE EFFECTIVE HOLDER — the single source of truth for "who is responsible for
// this stat".
//
// Every post's stats are its holder's responsibility. A post that is HFA
// (unfilled) does not drop its stats: responsibility rolls UP to the nearest
// FILLED senior post. With only the Chairman filled, the whole board rolls up to
// the Chairman; posting someone to an Exec Sec devolves that entire branch to
// them, with no manual reassignment step.
//
// PARENT CHAIN, in precedence order:
//   1. posts.senior_post_id            — explicit, always wins (exec → Chairman)
//   2. a top post                      — no senior of its own, but is someone
//                                        else's senior: that is the board root
//   3. a division-head post            → divisions.head_exec_post_id
//   4. a department-head post          → its division's head post
//   5. any other post                  → its department's head post
//
// Rule 2 exists because the chain would otherwise CYCLE on the real board: the
// Chairman is the head post of "Office of the OT Committee Chairman", which sits
// in Division 7, whose head post reports to an Exec Sec, whose senior is the
// Chairman. Rule 2 stops the walk at the Chairman. A visited-set guard backs it
// up, because head_exec_post_id is user-editable and can be pointed anywhere.
//
// FILLED means a holder LINKED TO A MEMBER. A post can carry a holder_name with
// no member row (a name typed on the board) — that person cannot sign in or
// report, so treating it as filled would strand the stats with nobody
// accountable. Such a post rolls up, and `hasUnlinkedHolder` lets the UI say so.

export type PostNode = {
  id: string;
  title: string;
  departmentId: string | null;
  divisionId: string | null;
  seniorPostId: string | null;
  isDeptHead: boolean;
  isDivisionHead: boolean;
  holderMemberId: string | null;
  holderName: string | null;
  hasUnlinkedHolder: boolean;
  divisionNumber: number | null;
  divisionName: string | null;
  departmentName: string | null;
  sortOrder: number;
  groupSort: number; // board order: division → department → post
};

export type StatRef = { id: string; name: string; postId: string };

export type Hierarchy = {
  posts: Map<string, PostNode>;
  parentOf(id: string): string | null;
  childrenOf(id: string): string[];
  /** The member responsible for this post, following the roll-up. */
  effectiveHolderOf(id: string): string | null;
  /** The post whose holder is responsible — self when filled, else an ancestor. */
  responsiblePostOf(id: string): string | null;
  statsOf(id: string): StatRef[];
  /** Every stat at or below this post, in board order. */
  statsBelow(id: string): StatRef[];
  /** Posts directly held (linked) by this member. */
  postsHeldBy(memberId: string): string[];
  /** Every stat this member is the effective holder of. */
  statsFor(memberId: string): StatRef[];
  allStats: StatRef[];
};

export async function loadHierarchy(): Promise<Hierarchy> {
  const supa = getServiceClient();
  const [postRes, deptRes, divRes, holderRes, statRes] = await Promise.all([
    supa
      .from('posts')
      .select('id, title, department_id, division_id, senior_post_id, sort_order'),
    supa.from('departments').select('id, name, division_id, head_post_id, sort_order'),
    supa.from('divisions').select('id, number, name, head_exec_post_id, sort_order'),
    supa.from('post_holders').select('post_id, member_id, holder_name, sort_order'),
    supa.from('stats').select('id, name, post_id').eq('active', true),
  ]);

  const depts = new Map((deptRes.data ?? []).map((d) => [d.id, d]));
  const divs = new Map((divRes.data ?? []).map((d) => [d.id, d]));
  const divisionHeadPost = new Map<string, string>(); // divisionId → post id

  // Holders: a linked member wins over a bare name on the same post.
  const holders = new Map<string, { memberId: string | null; name: string | null }>();
  for (const h of (holderRes.data ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const cur = holders.get(h.post_id);
    if (!cur || (!cur.memberId && h.member_id)) {
      holders.set(h.post_id, {
        memberId: (h.member_id as string | null) ?? null,
        name: (h.holder_name as string | null) ?? null,
      });
    }
  }

  const posts = new Map<string, PostNode>();
  for (const p of postRes.data ?? []) {
    if (p.division_id) divisionHeadPost.set(p.division_id, p.id);
  }
  for (const p of postRes.data ?? []) {
    const dept = p.department_id ? depts.get(p.department_id) : undefined;
    const divId = (p.division_id as string | null) ?? dept?.division_id ?? null;
    const div = divId ? divs.get(divId) : undefined;
    const holder = holders.get(p.id);
    posts.set(p.id, {
      id: p.id,
      title: p.title,
      departmentId: (p.department_id as string | null) ?? null,
      divisionId: (p.division_id as string | null) ?? null,
      seniorPostId: (p.senior_post_id as string | null) ?? null,
      isDeptHead: dept?.head_post_id === p.id,
      isDivisionHead: Boolean(p.division_id),
      holderMemberId: holder?.memberId ?? null,
      holderName: holder?.name ?? null,
      hasUnlinkedHolder: Boolean(holder && !holder.memberId && holder.name),
      divisionNumber: div?.number ?? null,
      divisionName: div?.name ?? null,
      departmentName: dept?.name ?? null,
      sortOrder: p.sort_order ?? 0,
      groupSort:
        (div?.sort_order ?? 99) * 1_000_000 +
        (p.division_id ? 0 : (dept?.sort_order ?? 99) * 1_000) + // division head first
        (p.sort_order ?? 0),
    });
  }

  // Anything named as a senior by someone else, that has no senior itself, is a
  // top of the board (rule 2).
  const isSeniorOfSomeone = new Set(
    (postRes.data ?? []).map((p) => p.senior_post_id).filter(Boolean) as string[],
  );

  const parent = new Map<string, string | null>();
  for (const [id, node] of posts) {
    let parentId: string | null = null;
    if (node.seniorPostId && posts.has(node.seniorPostId)) {
      parentId = node.seniorPostId;
    } else if (isSeniorOfSomeone.has(id)) {
      parentId = null; // board root
    } else if (node.isDivisionHead) {
      parentId = (node.divisionId && divs.get(node.divisionId)?.head_exec_post_id) || null;
    } else if (node.isDeptHead) {
      const divId = node.departmentId ? depts.get(node.departmentId)?.division_id : null;
      parentId = (divId && divisionHeadPost.get(divId)) || null;
    } else {
      const dept = node.departmentId ? depts.get(node.departmentId) : undefined;
      parentId =
        (dept?.head_post_id as string | null) ||
        (dept?.division_id ? divisionHeadPost.get(dept.division_id) ?? null : null);
    }
    if (parentId === id) parentId = null; // never a parent of itself
    if (parentId && !posts.has(parentId)) parentId = null;
    parent.set(id, parentId);
  }

  const children = new Map<string, string[]>();
  for (const [id] of posts) children.set(id, []);
  for (const [id, pid] of parent) {
    if (pid) children.get(pid)!.push(id);
  }
  for (const [, list] of children) {
    list.sort((a, b) => posts.get(a)!.groupSort - posts.get(b)!.groupSort);
  }

  // Effective holder: memoised upward walk, cycle-guarded.
  const effCache = new Map<string, string | null>();
  const respCache = new Map<string, string | null>();
  function responsiblePostOf(id: string): string | null {
    if (respCache.has(id)) return respCache.get(id)!;
    const seen = new Set<string>();
    let cur: string | null = id;
    let answer: string | null = null;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = posts.get(cur);
      if (!node) break;
      if (node.holderMemberId) {
        answer = cur;
        break;
      }
      cur = parent.get(cur) ?? null;
    }
    respCache.set(id, answer);
    return answer;
  }
  function effectiveHolderOf(id: string): string | null {
    if (effCache.has(id)) return effCache.get(id)!;
    const postId = responsiblePostOf(id);
    const holder = postId ? posts.get(postId)?.holderMemberId ?? null : null;
    effCache.set(id, holder);
    return holder;
  }

  const statsByPost = new Map<string, StatRef[]>();
  const allStats: StatRef[] = [];
  for (const s of statRes.data ?? []) {
    const ref = { id: s.id, name: s.name, postId: s.post_id };
    allStats.push(ref);
    const arr = statsByPost.get(s.post_id) ?? [];
    arr.push(ref);
    statsByPost.set(s.post_id, arr);
  }

  const belowCache = new Map<string, StatRef[]>();
  function statsBelow(id: string): StatRef[] {
    const hit = belowCache.get(id);
    if (hit) return hit;
    const out: StatRef[] = [...(statsByPost.get(id) ?? [])];
    for (const c of children.get(id) ?? []) out.push(...statsBelow(c));
    belowCache.set(id, out);
    return out;
  }

  return {
    posts,
    parentOf: (id) => parent.get(id) ?? null,
    childrenOf: (id) => children.get(id) ?? [],
    effectiveHolderOf,
    responsiblePostOf,
    statsOf: (id) => statsByPost.get(id) ?? [],
    statsBelow,
    postsHeldBy: (memberId) =>
      [...posts.values()]
        .filter((p) => p.holderMemberId === memberId)
        .sort((a, b) => a.groupSort - b.groupSort)
        .map((p) => p.id),
    statsFor: (memberId) =>
      allStats
        .filter((s) => effectiveHolderOf(s.postId) === memberId)
        .sort(
          (a, b) =>
            (posts.get(a.postId)?.groupSort ?? 0) - (posts.get(b.postId)?.groupSort ?? 0),
        ),
    allStats,
  };
}
