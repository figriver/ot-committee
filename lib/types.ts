export type EntityKind =
  | 'divisions'
  | 'departments'
  | 'sections'
  | 'posts'
  | 'post_holders'
  | 'board_meta';

export type Division = {
  id: string;
  number: number;
  name: string;
  vfp: string | null;
  color: string | null;
  sort_order: number;
  head_exec_post_id: string | null; // executive post this division reports to
};

export type Department = {
  id: string;
  division_id: string;
  number: number;
  name: string;
  vfp: string | null;
  sort_order: number;
  head_post_id: string | null; // the department's designated head (its Director)
};

export type Section = {
  id: string;
  department_id: string;
  name: string;
  vfp: string | null;
  sort_order: number;
};

export type Post = {
  id: string;
  department_id: string | null; // null for a division-level (division head) post
  division_id: string | null; // set when this post heads a division (its Secretary)
  section_id: string | null;
  title: string;
  purpose: string | null;
  product: string | null;
  senior_post_id: string | null;
  is_vacant: boolean;
  sort_order: number;
};

export type MemberRole = 'admin' | 'member';
export type MemberStatus = 'invited' | 'active';

export type Member = {
  id: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  auth_uid: string | null;
};

export type Holder = {
  id: string;
  post_id: string;
  member_id: string | null;
  holder_name: string | null;
  sort_order: number;
};

export type PostWithHolders = Post & { holders: Holder[] };
export type SectionWithPosts = Section & { posts: PostWithHolders[] };
export type DepartmentFull = Department & {
  sections: SectionWithPosts[];
  posts: PostWithHolders[]; // posts hanging directly off the department (no section)
  headPost: PostWithHolders | null; // the department's head (Director)
};
export type DivisionFull = Division & {
  departments: DepartmentFull[];
  headPost: PostWithHolders | null; // the division's head (Secretary)
};

// ---- Overview (whole-board tree) -------------------------------------------

/** An executive post: the Chairman, or any post reporting directly to it. */
export type ExecPost = {
  id: string;
  title: string;
  is_vacant: boolean;
  holderName: string | null; // the person holding this post (from post_holders), or null = vacant
};

/** The Chairman plus every executive post beneath it (in board order). */
export type ExecTier = {
  chairman: ExecPost | null;
  execs: ExecPost[];
};

/** Board-level settings (a single row). Currently just the overall board VFP. */
export type BoardMeta = {
  id: string;
  vfp: string | null;
};

// The overview carries the FULL division tree (departments → sections → posts →
// holders). The desktop layout reads just the labels; the mobile drawer renders
// the posts. Same data, two layouts — no second fetch.
export type BoardOverview = {
  divisions: DivisionFull[]; // already in board order; each carries head_exec_post_id
  chairman: ExecPost | null;
  execs: ExecPost[]; // executive posts under the Chairman, in board order
  meta: BoardMeta | null; // board-level settings (overall VFP)
};
