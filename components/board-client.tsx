'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  addDepartment,
  addExecutive,
  addSection,
  addPost,
  addHolder,
  assignDivisionToExec,
  assignHolderToMember,
  setPostHolder,
  deleteRow,
  moveRow,
  updateField,
} from '@/app/board/actions';
import { textOn } from '@/lib/color';
import type { MemberLite } from '@/lib/data';
import type {
  BoardOverview,
  BoardMeta,
  DivisionFull,
  DepartmentFull,
  SectionWithPosts,
  PostWithHolders,
  Holder,
  ExecPost,
  EntityKind,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Context menu (shared floating menu; opened by caret click OR right-click)
// ---------------------------------------------------------------------------

type MenuItem = {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
};

type MenuCtx = {
  open: (e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]) => void;
};

const MenuContext = createContext<MenuCtx>({ open: () => {} });
const useMenu = () => useContext(MenuContext);

// Members list for the "Link to member" holder action (division-detail only).
const MembersContext = createContext<MemberLite[]>([]);
const useMembers = () => useContext(MembersContext);

function MenuProvider({ children }: { children: ReactNode }) {
  // `anchor` is where the user clicked; the menu is measured after render and
  // clamped inside the viewport so it never clips off the right or bottom edge.
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const open = useCallback<MenuCtx['open']>((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);

  // After the menu renders, measure it and pull it back on-screen if needed.
  useLayoutEffect(() => {
    if (!state || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const M = 8; // viewport margin
    const x = Math.max(M, Math.min(state.x, W - rect.width - M));
    const y = Math.max(M, Math.min(state.y, H - rect.height - M));
    if (Math.abs(x - state.x) > 0.5 || Math.abs(y - state.y) > 0.5) {
      setState((s) => (s ? { ...s, x, y } : s));
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [state]);

  return (
    <MenuContext.Provider value={{ open }}>
      {children}
      {state && (
        <ul
          ref={menuRef}
          className="ctx-menu"
          style={{ left: state.x, top: state.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {state.items.map((it, i) =>
            it.separator ? (
              <li key={i} className="ctx-sep" aria-hidden />
            ) : (
              <li
                key={i}
                className={`ctx-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}`}
                onClick={() => {
                  if (it.disabled) return;
                  setState(null);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </li>
            ),
          )}
        </ul>
      )}
    </MenuContext.Provider>
  );
}

/** Small caret button that opens `items` as a menu. */
function Caret({ items, tone = 'dark' }: { items: MenuItem[]; tone?: 'dark' | 'light' }) {
  const { open } = useMenu();
  return (
    <button
      type="button"
      className={`caret ${tone}`}
      title="Menu"
      aria-label="Open menu"
      onClick={(e) => open(e, items)}
    >
      ▾
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline editing
// ---------------------------------------------------------------------------

function useEditable(kind: EntityKind, id: string, field: string, value: string | null) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [pending, start] = useTransition();
  useEffect(() => setVal(value ?? ''), [value]);

  const commit = () => {
    if ((val ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    start(async () => {
      await updateField(kind, id, field, val);
      setEditing(false);
    });
  };
  const cancel = () => {
    setVal(value ?? '');
    setEditing(false);
  };
  return { editing, setEditing, val, setVal, pending, commit, cancel };
}

type EditState = ReturnType<typeof useEditable>;

/** Like useEditable, but commits through a custom async function (e.g. a holder
 *  upsert) instead of the generic updateField. Same shape, so EditField works. */
function useInlineText(value: string | null, onCommit: (v: string) => Promise<void>) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [pending, start] = useTransition();
  useEffect(() => setVal(value ?? ''), [value]);
  const commit = () => {
    if ((val ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    start(async () => {
      await onCommit(val);
      setEditing(false);
    });
  };
  const cancel = () => {
    setVal(value ?? '');
    setEditing(false);
  };
  return { editing, setEditing, val, setVal, pending, commit, cancel };
}

function EditField({
  state,
  multiline,
  placeholder,
}: {
  state: EditState;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { val, setVal, commit, cancel } = state;
  if (multiline) {
    return (
      <textarea
        autoFocus
        className="edit-textarea"
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        }}
      />
    );
  }
  return (
    <input
      autoFocus
      className="edit-input"
      value={val}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      }}
    />
  );
}

function confirmRemove(label: string) {
  return typeof window === 'undefined'
    ? true
    : window.confirm(`Remove this ${label}? This cannot be undone.`);
}

// ---------------------------------------------------------------------------
// Entity: Post (used on the division-detail page and for exec boxes)
// ---------------------------------------------------------------------------

function useRowActions() {
  const [, start] = useTransition();
  return (fn: () => Promise<void>) => start(() => fn());
}

function PostRow({ post }: { post: PostWithHolders }) {
  const { open } = useMenu();
  const edit = useEditable('posts', post.id, 'title', post.title);
  const run = useRowActions();

  const items: MenuItem[] = [
    { label: 'Edit title', onSelect: () => edit.setEditing(true) },
    { label: 'Add Position', onSelect: () => run(() => addPost(post.department_id!, post.section_id)) },
    { label: 'Add Holder', onSelect: () => run(() => addHolder(post.id)) },
    {
      label: post.is_vacant ? 'Mark Filled' : 'Mark HFA',
      onSelect: () => run(() => updateField('posts', post.id, 'is_vacant', !post.is_vacant)),
    },
    { separator: true, label: '' },
    { label: 'Move up', onSelect: () => run(() => moveRow('posts', post.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('posts', post.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('post') && run(() => deleteRow('posts', post.id)) },
  ];

  return (
    <div className={`ob-post${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-post-title">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <span className="ob-post-name" onDoubleClick={() => edit.setEditing(true)}>
            {post.title}
          </span>
        )}
        {post.is_vacant && <span className="ob-vacant">HFA</span>}
        <Caret items={items} />
      </div>
      {post.holders.length > 0 && (
        <div className="ob-holders">
          {post.holders.map((h) => (
            <HolderRow key={h.id} holder={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HolderRow({ holder }: { holder: Holder }) {
  const { open } = useMenu();
  const members = useMembers();
  const edit = useEditable('post_holders', holder.id, 'holder_name', holder.holder_name);
  const run = useRowActions();

  const memberItems: MenuItem[] = members.map((m) => ({
    label: `${holder.member_id === m.id ? '✓ ' : ''}${m.email}`,
    onSelect: () => run(() => assignHolderToMember(holder.id, m.id)),
  }));

  const items: MenuItem[] = [
    { label: 'Edit name', onSelect: () => edit.setEditing(true) },
    { separator: true, label: '' },
    { label: 'Link to member:', disabled: true },
    ...(memberItems.length > 0
      ? memberItems
      : [{ label: 'No members yet', disabled: true } as MenuItem]),
    ...(holder.member_id
      ? [{ label: 'Unlink member', onSelect: () => run(() => assignHolderToMember(holder.id, null)) }]
      : []),
    { separator: true, label: '' },
    { label: 'Move up', onSelect: () => run(() => moveRow('post_holders', holder.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('post_holders', holder.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('holder') && run(() => deleteRow('post_holders', holder.id)) },
  ];
  return (
    <div className={`ob-holder${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      {edit.editing ? (
        <EditField state={edit} placeholder="holder name" />
      ) : (
        <span onDoubleClick={() => edit.setEditing(true)}>
          {holder.holder_name || <span className="ob-muted">unnamed</span>}
          {holder.member_id && <span className="ob-linked" title="Linked to a member">● member</span>}
        </span>
      )}
      <Caret items={items} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity: Section (a group of posts inside a department)
// ---------------------------------------------------------------------------

function SectionBlock({ section }: { section: SectionWithPosts }) {
  const { open } = useMenu();
  const edit = useEditable('sections', section.id, 'name', section.name);
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => edit.setEditing(true) },
    { label: 'Add Position', onSelect: () => run(() => addPost(section.department_id, section.id)) },
    { label: 'Move up', onSelect: () => run(() => moveRow('sections', section.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('sections', section.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('section') && run(() => deleteRow('sections', section.id)) },
  ];
  return (
    <div className="ob-section" onContextMenu={(e) => open(e, items)}>
      <div className="ob-section-head">
        {edit.editing ? <EditField state={edit} /> : <span onDoubleClick={() => edit.setEditing(true)}>{section.name}</span>}
        <Caret items={items} />
      </div>
      {section.posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity: Department column (division-detail page)
// ---------------------------------------------------------------------------

function DeptColumn({ dept, color }: { dept: DepartmentFull; color: string }) {
  const { open } = useMenu();
  const nameEdit = useEditable('departments', dept.id, 'name', dept.name);
  const vfpEdit = useEditable('departments', dept.id, 'vfp', dept.vfp);
  const run = useRowActions();
  const ink = textOn(color);

  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => nameEdit.setEditing(true) },
    { label: 'Add Section', onSelect: () => run(() => addSection(dept.id)) },
    { label: 'Add Position', onSelect: () => run(() => addPost(dept.id, null)) },
    { label: 'Edit VFP', onSelect: () => vfpEdit.setEditing(true) },
    { separator: true, label: '' },
    { label: 'Move left', onSelect: () => run(() => moveRow('departments', dept.id, 'up')) },
    { label: 'Move right', onSelect: () => run(() => moveRow('departments', dept.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('department') && run(() => deleteRow('departments', dept.id)) },
  ];

  return (
    <div className="ob-deptcol" onContextMenu={(e) => open(e, items)}>
      <div className="ob-deptcol-head" style={{ background: color, color: ink }}>
        <span className="ob-deptcol-num" style={{ color: ink }}>
          Dept {dept.number}
        </span>
        <span className="ob-deptcol-name">
          {nameEdit.editing ? (
            <EditField state={nameEdit} />
          ) : (
            <span onDoubleClick={() => nameEdit.setEditing(true)}>{dept.name}</span>
          )}
        </span>
        <Caret items={items} tone={ink === '#ffffff' ? 'light' : 'dark'} />
      </div>

      <div className="ob-deptcol-body">
        {dept.sections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}
        {dept.posts.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
        {dept.sections.length === 0 && dept.posts.length === 0 && (
          <div className="ob-empty">No positions yet — right-click to add.</div>
        )}
      </div>

      <div className="ob-deptcol-vfp">
        <span className="ob-vfp-key">VFP:</span>{' '}
        {vfpEdit.editing ? (
          <EditField state={vfpEdit} multiline placeholder="Department VFP" />
        ) : (
          <span className="ob-vfp-val" onDoubleClick={() => vfpEdit.setEditing(true)}>
            {dept.vfp || <span className="ob-muted">—</span>}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exec boxes (top tier)
// ---------------------------------------------------------------------------

/** The Chairman box. Its menu is where new executive posts are created. */
function ChairmanBox({ post }: { post: ExecPost | null }) {
  const { open } = useMenu();
  const edit = useEditable('posts', post?.id ?? '', 'title', post?.title ?? null);
  const holderEdit = useInlineText(post?.holderName ?? null, async (v) => {
    if (post) await setPostHolder(post.id, v);
  });
  const run = useRowActions();
  if (!post) {
    return (
      <div className="ob-exec chairman">
        <div className="ob-exec-role">Chairman</div>
        <div className="ob-exec-title ob-muted">(not seeded)</div>
      </div>
    );
  }
  const items: MenuItem[] = [
    { label: 'Edit title', onSelect: () => edit.setEditing(true) },
    { label: post.holderName ? 'Edit holder' : 'Set holder', onSelect: () => holderEdit.setEditing(true) },
    ...(post.holderName
      ? [{ label: 'Mark HFA', onSelect: () => run(() => setPostHolder(post.id, '')) }]
      : []),
    { separator: true, label: '' },
    { label: 'Add Executive', onSelect: () => run(() => addExecutive()) },
  ];
  return (
    <div className={`ob-exec chairman${edit.pending || holderEdit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-exec-role">Chairman</div>
      <div className="ob-exec-title">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <span onDoubleClick={() => edit.setEditing(true)}>{post.title}</span>
        )}
        <Caret items={items} tone="light" />
      </div>
      <HolderEditLine edit={holderEdit} name={post.holderName} tone="dark" />
    </div>
  );
}

/**
 * The holder line shown inside a box: the person's name, or an HFA tag when
 * unfilled — and editable in place. `edit` is a useInlineText state whose commit
 * writes through setPostHolder to the same post record. `tone="dark"` = dark box
 * (white name); `light` = light box. Double-click to edit.
 */
function HolderEditLine({
  edit,
  name,
  tone,
}: {
  edit: EditState;
  name: string | null;
  tone: 'dark' | 'light';
}) {
  return (
    <div className={`ob-holderline ${tone}${edit.pending ? ' pending' : ''}`}>
      {edit.editing ? (
        <EditField state={edit} placeholder="holder name" />
      ) : (
        <span
          className="ob-holderline-edit"
          title="Double-click to edit the holder"
          onDoubleClick={() => edit.setEditing(true)}
        >
          {name ? (
            <span className="ob-holderline-name">{name}</span>
          ) : (
            <span className="ob-vacant">HFA</span>
          )}
        </span>
      )}
    </div>
  );
}

/** Holder name of a post's first named holder, or null (= vacant → HFA). */
function holderNameOf(post: PostWithHolders | undefined | null): string | null {
  return post?.holders.find((h) => h.holder_name)?.holder_name ?? null;
}

/**
 * The head-post box for a division (its Secretary) or a department (its Director).
 * Shows the head post's title and its holder — a name, or HFA when unfilled — the
 * same way exec boxes show their holder. Both the title and the holder are
 * editable in place (double-click); the holder saves via setPostHolder.
 */
function HeadBox({ post, kind }: { post: PostWithHolders | null; kind: 'division' | 'department' }) {
  const { open } = useMenu();
  const titleEdit = useEditable('posts', post?.id ?? '', 'title', post?.title ?? null);
  const holderName = holderNameOf(post);
  const holderEdit = useInlineText(holderName, async (v) => {
    if (post) await setPostHolder(post.id, v);
  });
  const run = useRowActions();

  if (!post) {
    return (
      <div className={`ob-headbox ${kind}`}>
        <span className="ob-headbox-role">{kind === 'division' ? 'Secretary' : 'Director'}</span>
        <span className="ob-vacant">HFA</span>
      </div>
    );
  }

  const items: MenuItem[] = [
    { label: 'Edit title', onSelect: () => titleEdit.setEditing(true) },
    { label: holderName ? 'Edit holder' : 'Set holder', onSelect: () => holderEdit.setEditing(true) },
    ...(holderName
      ? [{ label: 'Mark HFA', onSelect: () => run(() => setPostHolder(post.id, '')) }]
      : []),
  ];

  return (
    <div
      className={`ob-headbox ${kind}${titleEdit.pending || holderEdit.pending ? ' pending' : ''}`}
      onContextMenu={(e) => open(e, items)}
    >
      <div className="ob-headbox-title">
        {titleEdit.editing ? (
          <EditField state={titleEdit} />
        ) : (
          <span onDoubleClick={() => titleEdit.setEditing(true)}>{post.title}</span>
        )}
        <Caret items={items} />
      </div>
      <div className="ob-headbox-holder">
        {holderEdit.editing ? (
          <EditField state={holderEdit} placeholder="holder name" />
        ) : (
          <span
            className="ob-headbox-holder-val"
            title="Double-click to edit the holder"
            onDoubleClick={() => holderEdit.setEditing(true)}
          >
            {holderName ?? <span className="ob-vacant">HFA</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/** One executive post under the Chairman; heads the division group beneath it. */
function ExecBox({ post }: { post: ExecPost }) {
  const { open } = useMenu();
  const edit = useEditable('posts', post.id, 'title', post.title);
  const holderEdit = useInlineText(post.holderName, async (v) => {
    await setPostHolder(post.id, v);
  });
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit title', onSelect: () => edit.setEditing(true) },
    { label: post.holderName ? 'Edit holder' : 'Set holder', onSelect: () => holderEdit.setEditing(true) },
    ...(post.holderName
      ? [{ label: 'Mark HFA', onSelect: () => run(() => setPostHolder(post.id, '')) }]
      : []),
    { separator: true, label: '' },
    {
      label: 'Remove executive',
      danger: true,
      onSelect: () =>
        confirmRemove('executive post (its divisions become unassigned)') &&
        run(() => deleteRow('posts', post.id)),
    },
  ];
  return (
    <div className={`ob-exec execsec${edit.pending || holderEdit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-exec-role">Executive</div>
      <div className="ob-exec-title">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <span onDoubleClick={() => edit.setEditing(true)}>{post.title}</span>
        )}
        <Caret items={items} tone="light" />
      </div>
      <HolderEditLine edit={holderEdit} name={post.holderName} tone="dark" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: a single division column (whole-board tree)
// ---------------------------------------------------------------------------

// Org-board seniority: Div 1 (Establishment/Communications) and Div 5 (Qualifications)
// hold a senior/correcting relationship to the line divisions, so their columns
// are rendered RAISED (a fixed offset above the others), giving a staggered top
// edge. Keyed by division identity, not color or board position.
const RAISED_DIVISIONS = new Set([1, 5]);

function DivisionColumn({
  division,
  execs,
}: {
  division: DivisionFull;
  execs: ExecPost[];
}) {
  const { open } = useMenu();
  const nameEdit = useEditable('divisions', division.id, 'name', division.name);
  const run = useRowActions();
  const color = division.color ?? '#e5e7eb';
  const ink = textOn(color);

  const assignItems: MenuItem[] = execs.map((e) => ({
    label: `${division.head_exec_post_id === e.id ? '✓ ' : ''}${e.title}`,
    onSelect: () => run(() => assignDivisionToExec(division.id, e.id)),
  }));

  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => nameEdit.setEditing(true) },
    { label: 'Add Department', onSelect: () => run(() => addDepartment(division.id)) },
    { separator: true, label: '' },
    { label: 'Assign to exec:', disabled: true },
    ...(assignItems.length > 0
      ? assignItems
      : [{ label: 'No executives yet', disabled: true } as MenuItem]),
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('division') && run(() => deleteRow('divisions', division.id)) },
  ];

  const raised = RAISED_DIVISIONS.has(division.number);

  return (
    <div className={`ob-divcol${raised ? ' ob-raised' : ''}`}>
      <div
        className="ob-divcol-head"
        style={{ background: color, color: ink }}
        onContextMenu={(e) => open(e, items)}
      >
        <div className="ob-divcol-head-top">
          <span className="ob-divcol-num" style={{ borderColor: ink, color: ink }}>
            Div {division.number}
          </span>
          <Link href={`/board/${division.number}`} className="ob-divcol-name" style={{ color: ink }}>
            {nameEdit.editing ? (
              <span onClick={(e) => e.preventDefault()}>
                <EditField state={nameEdit} />
              </span>
            ) : (
              division.name
            )}
          </Link>
          <Caret items={items} tone={ink === '#ffffff' ? 'light' : 'dark'} />
        </div>
      </div>

      {/* The division's head post (its Secretary) — editable, holder-or-HFA. */}
      <HeadBox post={division.headPost} kind="division" />

      <div className="ob-divcol-depts">
        {division.departments.map((dept) => (
          <DeptBox key={dept.id} dept={dept} divisionNumber={division.number} />
        ))}
      </div>

      <div className="ob-divcol-vfp" style={{ borderColor: color }}>
        <span className="ob-vfp-key">VFP:</span> {division.vfp || <span className="ob-muted">—</span>}
      </div>
    </div>
  );
}

function DeptBox({
  dept,
  divisionNumber,
}: {
  dept: DepartmentFull;
  divisionNumber: number;
}) {
  const { open } = useMenu();
  const edit = useEditable('departments', dept.id, 'name', dept.name);
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => edit.setEditing(true) },
    { label: 'Add Section', onSelect: () => run(() => addSection(dept.id)) },
    { label: 'Add Position', onSelect: () => run(() => addPost(dept.id, null)) },
    { separator: true, label: '' },
    { label: 'Move up', onSelect: () => run(() => moveRow('departments', dept.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('departments', dept.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('department') && run(() => deleteRow('departments', dept.id)) },
  ];

  return (
    <div className={`ob-deptbox${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-deptbox-head">
        <span className="ob-deptbox-num">Dept {dept.number}</span>
        <Caret items={items} />
      </div>
      <span className="ob-deptbox-name">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <Link href={`/board/${divisionNumber}`}>{dept.name}</Link>
        )}
      </span>
      {/* The department's head post (its Director) — editable, holder-or-HFA. */}
      <HeadBox post={dept.headPost} kind="department" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector lines (pure presentation) — used on the division-detail page.
// The overview tree draws its own connectors purely in CSS (see .ob-tree).
// ---------------------------------------------------------------------------

function VLine({ left, top, height }: { left: number; top: number; height: number }) {
  return <span className="cx-v" style={{ left: `${left}%`, top, height }} />;
}

/** The overall board VFP bar — editable in place, stored in board_meta. */
function BoardVfpBar({ meta }: { meta: BoardMeta | null }) {
  const edit = useEditable('board_meta', meta?.id ?? '', 'vfp', meta?.vfp ?? null);
  return (
    <div className={`ob-board-vfp${edit.pending ? ' pending' : ''}`}>
      <span className="ob-vfp-key">OT Committee — Valuable Final Product:</span>{' '}
      {!meta ? (
        <span className="ob-muted">—</span>
      ) : edit.editing ? (
        <EditField state={edit} multiline placeholder="Overall board VFP" />
      ) : (
        <span
          className="ob-board-vfp-val"
          title="Double-click to edit"
          onDoubleClick={() => edit.setEditing(true)}
        >
          {meta.vfp || <span className="ob-muted">—</span>}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page roots
// ---------------------------------------------------------------------------

export function OverviewBoard({ data }: { data: BoardOverview }) {
  const { divisions, chairman, execs, meta } = data;

  // Group divisions under the exec they report to, keeping board (sort) order.
  const execIds = new Set(execs.map((e) => e.id));
  const byExec = new Map<string, DivisionFull[]>();
  const unassigned: DivisionFull[] = [];
  for (const d of divisions) {
    if (d.head_exec_post_id && execIds.has(d.head_exec_post_id)) {
      const list = byExec.get(d.head_exec_post_id) ?? [];
      list.push(d);
      byExec.set(d.head_exec_post_id, list);
    } else {
      unassigned.push(d);
    }
  }

  return (
    <MenuProvider>
      <div className="ob-topbar">
        <h1>OT Committee Org Board</h1>
        <span className="ob-hint">
          Right-click (or the ▾ caret) on any box to edit · Chairman ▸ “Add Executive” · a division ▸ “Assign to exec…”
        </span>
      </div>

      {/* Desktop / tablet: the full horizontal org-board tree (≥ 640px). */}
      <div className="ob-desktop ob-scroll">
        <div className="ob-board">
          {/* Whole-board tree: Chairman → executives → their division groups.
              Connectors are drawn in CSS so they always follow the assignment. */}
          <div className="ob-tree">
            <ul className="ob-tier">
              <li>
                <ChairmanBox post={chairman} />
                <ul className="ob-tier ob-exectier">
                  {execs.map((ex) => {
                    const cols = byExec.get(ex.id) ?? [];
                    return (
                      <li key={ex.id}>
                        <ExecBox post={ex} />
                        <ul className="ob-tier ob-divtier">
                          {cols.length === 0 ? (
                            <li>
                              <div className="ob-noassign">
                                No divisions assigned
                                <span className="ob-noassign-hint">
                                  Use a division’s “Assign to exec” menu
                                </span>
                              </div>
                            </li>
                          ) : (
                            cols.map((d) => (
                              <li key={d.id}>
                                <DivisionColumn division={d} execs={execs} />
                              </li>
                            ))
                          )}
                        </ul>
                      </li>
                    );
                  })}

                  {unassigned.length > 0 && (
                    <li>
                      <div className="ob-exec ob-exec-orphan">
                        <div className="ob-exec-role">Unassigned</div>
                        <div className="ob-exec-title">No executive</div>
                      </div>
                      <ul className="ob-tier ob-divtier">
                        {unassigned.map((d) => (
                          <li key={d.id}>
                            <DivisionColumn division={d} execs={execs} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </li>
            </ul>
          </div>

          {/* Board-wide VFP (editable, stored in board_meta) */}
          <BoardVfpBar meta={meta} />
        </div>
      </div>

      {/* Phone: a vertical drawer stack of divisions (< 640px). Same data. */}
      <MobileBoard divisions={divisions} chairman={chairman} execs={execs} />
    </MenuProvider>
  );
}

// ---------------------------------------------------------------------------
// Mobile board — a vertical stack of division drawers (read view)
// ---------------------------------------------------------------------------

function MobileBoard({
  divisions,
  chairman,
  execs,
}: {
  divisions: DivisionFull[];
  chairman: ExecPost | null;
  execs: ExecPost[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const execById = new Map(execs.map((e) => [e.id, e] as const));

  return (
    <div className="ob-mobile">
      {/* Executive structure as a simple labeled section (no connector tree). */}
      <div className="mb-exec">
        <div className="mb-exec-row">
          <span className="mb-exec-label">Chairman</span>
          <span className="mb-exec-val">
            {chairman ? chairman.title : '—'}
            {chairman?.is_vacant && <span className="ob-vacant">HFA</span>}
          </span>
        </div>
        <div className="mb-exec-row">
          <span className="mb-exec-label">Executives</span>
          <span className="mb-exec-val">
            {execs.length ? execs.map((e) => e.title).join(' · ') : '—'}
          </span>
        </div>
      </div>

      <div className="mb-stack">
        {divisions.map((d) => (
          <MobileDivision
            key={d.id}
            division={d}
            exec={
              d.head_exec_post_id
                ? execById.get(d.head_exec_post_id) ?? null
                : null
            }
            open={openId === d.id}
            onToggle={() => setOpenId((cur) => (cur === d.id ? null : d.id))}
          />
        ))}
      </div>
    </div>
  );
}

function MobileDivision({
  division,
  exec,
  open,
  onToggle,
}: {
  division: DivisionFull;
  exec: ExecPost | null;
  open: boolean;
  onToggle: () => void;
}) {
  const color = division.color ?? '#e5e7eb';
  const ink = textOn(color);
  return (
    <div className={`mb-div${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mb-div-head"
        style={{ background: color, color: ink }}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="mb-div-num" style={{ borderColor: ink, color: ink }}>
          Div {division.number}
        </span>
        <span className="mb-div-name">{division.name}</span>
        <span className="mb-div-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mb-div-body">
          {exec && (
            <div className="mb-reports">
              Reports to <strong>{exec.title}</strong>
            </div>
          )}
          {division.headPost && (
            <div className="mb-head">
              <span className="mb-head-title">{division.headPost.title}</span>
              <span className="mb-head-holder">
                {holderNameOf(division.headPost) ?? <span className="ob-vacant">HFA</span>}
              </span>
            </div>
          )}
          {division.vfp && (
            <div className="mb-vfp">
              <span className="mb-vfp-key">VFP</span> {division.vfp}
            </div>
          )}

          {division.departments.map((dept) => (
            <div key={dept.id} className="mb-dept">
              <div className="mb-dept-head">
                <span className="mb-dept-num">Dept {dept.number}</span>
                <span className="mb-dept-name">{dept.name}</span>
              </div>
              <div className="mb-posts">
                {dept.sections.map((s) => (
                  <div key={s.id} className="mb-section">
                    <div className="mb-section-name">{s.name}</div>
                    {s.posts.map((p) => (
                      <MobilePost key={p.id} post={p} />
                    ))}
                  </div>
                ))}
                {dept.posts.map((p) => (
                  <MobilePost key={p.id} post={p} />
                ))}
                {dept.sections.length === 0 && dept.posts.length === 0 && (
                  <div className="mb-empty">No posts yet</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobilePost({ post }: { post: PostWithHolders }) {
  const names = post.holders
    .map((h) => h.holder_name || 'unnamed')
    .filter(Boolean);
  return (
    <div className="mb-post">
      <span className="mb-post-title">{post.title}</span>
      {post.is_vacant && <span className="ob-vacant">HFA</span>}
      {names.length > 0 && (
        <span className="mb-post-holders">{names.join(', ')}</span>
      )}
    </div>
  );
}

export function DivisionDetail({
  division,
  seniorExec,
  seniorRole,
  members = [],
}: {
  division: DivisionFull;
  seniorExec: ExecPost | null;
  seniorRole: string;
  members?: MemberLite[];
}) {
  const color = division.color ?? '#e5e7eb';
  const ink = textOn(color);
  const vfpEdit = useEditableDivisionVfp(division);

  return (
    <MembersContext.Provider value={members}>
    <MenuProvider>
      <div className="ob-topbar">
        <Link href="/board" className="ob-back">
          ← Board
        </Link>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ob-swatch" style={{ background: color }} />
          Division {division.number} · {division.name}
        </h1>
      </div>

      <div className="ob-scroll">
        <div className="ob-detail">
          {/* Senior exec box connected above */}
          <div className="ob-senior-wrap">
            <div className="ob-senior" style={{ borderColor: color }}>
              <div className="ob-exec-role">{seniorRole}</div>
              <div className="ob-senior-title">
                {seniorExec ? (
                  <>
                    {seniorExec.title}
                    {seniorExec.is_vacant && <span className="ob-vacant">HFA</span>}
                  </>
                ) : (
                  <span className="ob-muted">(unassigned)</span>
                )}
              </div>
            </div>
            <div className="cx-zone" style={{ height: 18 }}>
              <VLine left={50} top={0} height={18} />
            </div>
            <div className="ob-division-band" style={{ background: color, color: ink }}>
              Division {division.number} — {division.name}
            </div>
          </div>

          {/* Departments side by side */}
          <div className="ob-detail-cols">
            {division.departments.map((dept) => (
              <DeptColumn key={dept.id} dept={dept} color={color} />
            ))}
          </div>

          {/* Division VFP bar */}
          <div className="ob-division-vfp" style={{ background: color, color: ink }}>
            <span className="ob-vfp-key" style={{ color: ink }}>
              Division {division.number} · {division.name} — VFP:
            </span>{' '}
            {vfpEdit.editing ? (
              <EditField state={vfpEdit} multiline placeholder="Division VFP" />
            ) : (
              <span onDoubleClick={() => vfpEdit.setEditing(true)}>
                {division.vfp || <span className="ob-muted">—</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </MenuProvider>
    </MembersContext.Provider>
  );
}

// division VFP needs its own editable; wrap in a tiny hook so it lives above the JSX
function useEditableDivisionVfp(division: DivisionFull) {
  return useEditable('divisions', division.id, 'vfp', division.vfp);
}

export { MenuProvider };
