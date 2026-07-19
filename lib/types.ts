export type EntityKind =
  | 'divisions'
  | 'departments'
  | 'sections'
  | 'posts'
  | 'post_holders';

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
  department_id: string;
  section_id: string | null;
  title: string;
  purpose: string | null;
  product: string | null;
  senior_post_id: string | null;
  is_vacant: boolean;
  sort_order: number;
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
};
export type DivisionFull = Division & { departments: DepartmentFull[] };

// ---- Overview (whole-board tree) -------------------------------------------

/** An executive post: the Chairman, or any post reporting directly to it. */
export type ExecPost = {
  id: string;
  title: string;
  is_vacant: boolean;
};

/** The Chairman plus every executive post beneath it (in board order). */
export type ExecTier = {
  chairman: ExecPost | null;
  execs: ExecPost[];
};

export type DivisionOverview = Division & {
  departments: Pick<Department, 'id' | 'number' | 'name' | 'vfp'>[];
};

export type BoardOverview = {
  divisions: DivisionOverview[]; // already in board order; each carries head_exec_post_id
  chairman: ExecPost | null;
  execs: ExecPost[]; // executive posts under the Chairman, in board order
};
